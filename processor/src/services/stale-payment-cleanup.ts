import type { CommercetoolsPaymentService } from "@commercetools/connect-payments-sdk";
import type { Cart, CartUpdateAction, Payment } from "@commercetools/platform-sdk";
import { NuveiApiError, nuveiClient } from "../clients/nuvei.client.js";
import { log } from "../libs/logger/index.js";

/**
 * Nuvei errCode returned by getPaymentStatus when the shopper never attempted a
 * payment in the session ("A payment was not performed during this session").
 */
export const NUVEI_NO_PAYMENT_ERR_CODE = 1140;

/**
 * Sessions younger than this are never removed. CT Checkout mounts several
 * dropins at once and a remount can race an in-flight creation of the same
 * method; the grace period guarantees we never delete a session whose token a
 * browser has only just received.
 */
export const STALE_PAYMENT_MIN_AGE_MS = 60_000;

/** Upper bound on Nuvei verification calls per cleanup run. */
const MAX_STALE_VERIFICATIONS = 5;
const NUVEI_VERIFICATION_TIMEOUT_MS = 5_000;

/**
 * Structural slice of the platform SDK client used to read and update the cart.
 * Structurally satisfied by paymentSDK.ctAPI.client.
 */
export type StalePaymentCartClient = {
  carts: () => {
    withId: (arg: { ID: string }) => {
      get: () => { execute: () => Promise<{ body: Cart }> };
      post: (arg: { body: { version: number; actions: CartUpdateAction[] } }) => {
        execute: () => Promise<{ body: Cart }>;
      };
    };
  };
};

export type StalePaymentCleanerOptions = {
  ctPaymentService: Pick<CommercetoolsPaymentService, "getPayment">;
  ctCartClient: StalePaymentCartClient;
  now?: () => number;
};

/**
 * Bounds the number of abandoned Nuvei sessions linked to a cart.
 *
 * Every dropin mount creates an openOrder session plus a CT Payment, and only one
 * is ever paid. When a new session is created, earlier Payments of the SAME
 * method that were never used are unlinked from the cart (`removePayment`), so a
 * cart carries at most one unused session per method regardless of retries.
 *
 * A Payment is removed only if ALL of the following hold, because a CT Payment
 * with only Initial transactions can still hide an in-flight Nuvei payment
 * (PENDING confirms/DMNs deliberately write nothing to CT):
 *  - same payment method as the new session (never touches the sibling method),
 *  - bound to a Nuvei session (interfaceId equals a transaction interactionId),
 *  - every transaction is still `Initial`,
 *  - older than STALE_PAYMENT_MIN_AGE_MS,
 *  - Nuvei confirms no payment was ever performed in that session (errCode 1140).
 * Any other outcome — including Nuvei errors or timeouts — keeps the Payment.
 *
 * The Payment resources themselves are not deleted; only the cart link is.
 */
export class StalePaymentCleaner {
  private readonly ctPaymentService: Pick<CommercetoolsPaymentService, "getPayment">;
  private readonly ctCartClient: StalePaymentCartClient;
  private readonly now: () => number;

  public constructor(opts: StalePaymentCleanerOptions) {
    this.ctPaymentService = opts.ctPaymentService;
    this.ctCartClient = opts.ctCartClient;
    this.now = opts.now ?? Date.now;
  }

  /** Returns the ids of the Payments that were unlinked from the cart. */
  public async removeStaleSessionPayments(opts: {
    cartId: string;
    keepPaymentId: string;
    method: string;
  }): Promise<string[]> {
    const cartRequest = this.ctCartClient.carts().withId({ ID: opts.cartId });
    const cart = (await cartRequest.get().execute()).body;

    const otherIds = (cart.paymentInfo?.payments ?? [])
      .map((ref) => ref.id)
      .filter((id) => id !== opts.keepPaymentId);
    if (otherIds.length === 0) return [];

    const settled = await Promise.allSettled(
      otherIds.map((id) => this.ctPaymentService.getPayment({ id })),
    );
    const candidates = settled
      .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
      .filter((payment) => this.isUnusedSessionPayment(payment, opts.method))
      .slice(0, MAX_STALE_VERIFICATIONS);
    if (candidates.length === 0) return [];

    const verified = await Promise.all(
      candidates.map(async (payment) =>
        (await this.nuveiConfirmsNoPayment(payment)) ? payment.id : undefined,
      ),
    );
    const removable = verified.filter((id): id is string => id !== undefined);
    if (removable.length === 0) return [];

    await this.unlink(opts.cartId, cart.version, removable);
    log.info("Removed unused Nuvei session Payments from cart.", {
      cartId: opts.cartId,
      method: opts.method,
      removedPaymentIds: removable,
    });
    return removable;
  }

  private isUnusedSessionPayment(payment: Payment, method: string): boolean {
    if (payment.paymentMethodInfo?.method !== method) return false;

    const transactions = payment.transactions ?? [];
    if (transactions.length === 0) return false;
    if (!transactions.every((transaction) => transaction.state === "Initial")) return false;

    const sessionToken = payment.interfaceId;
    if (!sessionToken) return false;
    if (!transactions.some((transaction) => transaction.interactionId === sessionToken)) {
      return false;
    }

    const createdAt = Date.parse(payment.createdAt);
    if (!Number.isFinite(createdAt)) return false;
    return this.now() - createdAt >= STALE_PAYMENT_MIN_AGE_MS;
  }

  private async nuveiConfirmsNoPayment(payment: Payment): Promise<boolean> {
    try {
      await nuveiClient().getPaymentStatus({
        sessionToken: payment.interfaceId as string,
        signal: AbortSignal.timeout(NUVEI_VERIFICATION_TIMEOUT_MS),
      });
      // A successful status response means the session had activity: keep it.
      return false;
    } catch (error) {
      return (
        error instanceof NuveiApiError && Number(error.errCode) === NUVEI_NO_PAYMENT_ERR_CODE
      );
    }
  }

  private async unlink(cartId: string, version: number, paymentIds: string[]): Promise<void> {
    const request = this.ctCartClient.carts().withId({ ID: cartId });
    const toActions = (ids: string[]): CartUpdateAction[] =>
      ids.map((id) => ({ action: "removePayment", payment: { typeId: "payment", id } }));
    try {
      await request.post({ body: { version, actions: toActions(paymentIds) } }).execute();
    } catch (initialError) {
      // The cart is updated concurrently by CT Checkout; retry once on a fresh version.
      const latest = (await request.get().execute()).body;
      const stillLinked = new Set((latest.paymentInfo?.payments ?? []).map((ref) => ref.id));
      const remaining = paymentIds.filter((id) => stillLinked.has(id));
      if (remaining.length === 0) return;
      log.warn("Removing stale Payments failed; retrying once with fresh cart version.", {
        cartId,
        error: initialError instanceof Error ? initialError.message : String(initialError),
      });
      await request
        .post({ body: { version: latest.version, actions: toActions(remaining) } })
        .execute();
    }
  }
}
