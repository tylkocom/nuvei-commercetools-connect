import type { Order, OrderPagedQueryResponse, Payment } from "@commercetools/platform-sdk";
import { log } from "../libs/logger/index.js";

/**
 * Minimal structural slice of the platform SDK ByProjectKeyRequestBuilder used
 * to read and update Orders. Structurally satisfied by paymentSDK.ctAPI.client
 * (the SDK's own order service is read-only) and trivially mockable in tests.
 */
export type CommercetoolsOrderClient = {
  orders: () => {
    get: (arg: {
      queryArgs: { where: string; expand: string[]; limit: number };
    }) => { execute: () => Promise<{ body: OrderPagedQueryResponse }> };
    withId: (arg: { ID: string }) => {
      post: (arg: {
        body: {
          version: number;
          actions: Array<{ action: "changePaymentState"; paymentState: "Paid" }>;
        };
      }) => { execute: () => Promise<{ body: Order }> };
    };
  };
};

export type OrderPaymentStateOutcome =
  | "updated"
  | "already-paid"
  | "not-paid"
  | "no-order"
  | "ambiguous"
  | "error";

/** What payment confirmation / DMN handling depend on (and tests mock). */
export type OrderPaymentStateSyncer = {
  syncWithRetry: (paymentId: string) => Promise<unknown>;
};

/**
 * Fire-and-forget: the payment response must never wait on, or fail because
 * of, Order bookkeeping. Absent syncer (not configured) is a no-op.
 */
export function triggerOrderPaymentStateSync(
  syncer: OrderPaymentStateSyncer | undefined,
  paymentId: string,
): void {
  if (!syncer) return;
  try {
    void Promise.resolve(syncer.syncWithRetry(paymentId)).catch((error) => {
      log.warn("Order paymentState sync rejected.", {
        paymentId,
        reason: error instanceof Error ? error.message : String(error),
      });
    });
  } catch (error) {
    log.warn("Order paymentState sync threw.", {
      paymentId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export type OrderPaymentStateSyncOptions = {
  client: CommercetoolsOrderClient;
  /** Backoff before each re-check while Checkout has not created the Order yet. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
};

// Checkout creates the Order when the transaction goes Pending, so it normally
// exists before the PSP result arrives — but the confirm path can win the race
// by about a second. Total wait is ~7.5s.
const DEFAULT_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000];
const MAX_CONCURRENT_MODIFICATION_ATTEMPTS = 3;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isConcurrentModification(error: unknown): boolean {
  const e = error as { statusCode?: unknown; code?: unknown; httpErrorStatus?: unknown };
  return e?.statusCode === 409 || e?.httpErrorStatus === 409 || e?.code === 409;
}

/**
 * Amount the shopper has to pay: mirrors the Payment SDK's getPaymentAmount
 * (gross when the Order is taxed, otherwise the plain total).
 */
function payableAmount(order: Order): { centAmount: number; currencyCode: string } {
  return order.taxedPrice?.totalGross ?? order.totalPrice;
}

function orderPayments(order: Order): Payment[] {
  return (order.paymentInfo?.payments ?? [])
    .map((ref) => ref.obj)
    .filter((payment): payment is Payment => payment !== undefined);
}

/**
 * True when some payment on the Order holds a single successful Charge that
 * covers the whole payable amount. Charges are deliberately NOT summed: a
 * duplicated charge must never make a part-paid Order look paid, and sibling
 * payments left in Initial (card + BLIK are created together) are ignored.
 */
function hasCoveringCharge(order: Order): boolean {
  const payable = payableAmount(order);
  return orderPayments(order).some((payment) =>
    (payment.transactions ?? []).some(
      (tx) =>
        tx.type === "Charge" &&
        tx.state === "Success" &&
        tx.amount.currencyCode === payable.currencyCode &&
        tx.amount.centAmount >= payable.centAmount,
    ),
  );
}

/**
 * Sets Order.paymentState = Paid once a Payment has a successful Charge.
 *
 * Neither Checkout nor the payment connector template set the Order's
 * paymentState, so without this the Order stays unset after a successful
 * payment. Only ever moves an Order to Paid; Failed/Pending are intentionally
 * not derived because abandoned sibling payments make them unreliable.
 */
export class OrderPaymentStateSync {
  private readonly client: CommercetoolsOrderClient;
  private readonly retryDelaysMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;

  public constructor(opts: OrderPaymentStateSyncOptions) {
    this.client = opts.client;
    this.retryDelaysMs = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  /** One attempt. Throws on unexpected commercetools errors. */
  public async syncOnce(paymentId: string): Promise<OrderPaymentStateOutcome> {
    for (let attempt = 1; ; attempt += 1) {
      const response = await this.client
        .orders()
        .get({
          queryArgs: {
            where: `paymentInfo(payments(id="${paymentId}"))`,
            expand: ["paymentInfo.payments[*]"],
            limit: 2,
          },
        })
        .execute();
      const orders = response.body.results;

      if (orders.length === 0) return "no-order";
      if (orders.length > 1) {
        log.warn("Several Orders reference the Payment; not setting paymentState.", {
          paymentId,
          orderIds: orders.map((o) => o.id),
        });
        return "ambiguous";
      }

      const order = orders[0];
      if (order.paymentState === "Paid") return "already-paid";
      if (!hasCoveringCharge(order)) return "not-paid";

      try {
        await this.client
          .orders()
          .withId({ ID: order.id })
          .post({
            body: {
              version: order.version,
              actions: [{ action: "changePaymentState", paymentState: "Paid" }],
            },
          })
          .execute();
      } catch (error) {
        if (isConcurrentModification(error) && attempt < MAX_CONCURRENT_MODIFICATION_ATTEMPTS) {
          continue;
        }
        throw error;
      }

      log.info("Order paymentState set to Paid.", { paymentId, orderId: order.id });
      return "updated";
    }
  }

  /**
   * Like syncOnce, but waits for the Order to appear and never rejects, so it
   * is safe to fire from payment confirmation / DMN handling without letting an
   * Order bookkeeping problem fail or delay the payment itself.
   */
  public async syncWithRetry(paymentId: string): Promise<OrderPaymentStateOutcome> {
    try {
      let outcome = await this.syncOnce(paymentId);
      for (const delay of this.retryDelaysMs) {
        if (outcome !== "no-order") break;
        await this.sleep(delay);
        outcome = await this.syncOnce(paymentId);
      }
      if (outcome === "no-order") {
        log.warn("No Order found for Payment after retries; paymentState not set.", { paymentId });
      }
      return outcome;
    } catch (error) {
      log.error("Failed to set Order paymentState.", {
        paymentId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return "error";
    }
  }
}
