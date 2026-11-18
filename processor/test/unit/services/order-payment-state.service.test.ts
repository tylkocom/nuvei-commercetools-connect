import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/libs/logger/index", () => ({
  log: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import {
  OrderPaymentStateSync,
  type CommercetoolsOrderClient,
} from "../../../src/services/order-payment-state.service";

type Tx = { type: string; state: string; amount: { centAmount: number; currencyCode: string } };

function payment(id: string, planned: number, transactions: Tx[]) {
  return {
    typeId: "payment",
    id,
    obj: {
      id,
      amountPlanned: { centAmount: planned, currencyCode: "PLN" },
      transactions,
    },
  };
}

function charge(centAmount: number, state = "Success"): Tx {
  return { type: "Charge", state, amount: { centAmount, currencyCode: "PLN" } };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    version: 1,
    totalPrice: { centAmount: 1000, currencyCode: "PLN" },
    paymentInfo: { payments: [payment("pay-card", 1000, [charge(1000)])] },
    ...overrides,
  };
}

function setup(orders: unknown[][] | unknown[]) {
  const queue = (Array.isArray(orders[0]) || orders.length === 0 ? orders : [orders]) as unknown[][];
  const get = vi.fn();
  for (const results of queue) {
    get.mockReturnValueOnce({ execute: async () => ({ body: { results } }) });
  }
  // keep returning the last result set
  const last = queue[queue.length - 1] ?? [];
  get.mockReturnValue({ execute: async () => ({ body: { results: last } }) });

  const post = vi.fn(() => ({ execute: async () => ({ body: {} }) }));
  const withId = vi.fn(() => ({ post }));
  const client = {
    orders: () => ({ get, withId }),
  } as unknown as CommercetoolsOrderClient;
  return { client, get, post, withId };
}

const sleep = vi.fn(async () => {});

describe("OrderPaymentStateSync.syncOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks the order up by payment id and sets Paid when a charge covers the order", async () => {
    const { client, get, post, withId } = setup([order()]);
    const sync = new OrderPaymentStateSync({ client, sleep });

    const outcome = await sync.syncOnce("pay-card");

    expect(outcome).toBe("updated");
    expect(get).toHaveBeenCalledWith({
      queryArgs: expect.objectContaining({
        where: 'paymentInfo(payments(id="pay-card"))',
        expand: ["paymentInfo.payments[*]"],
      }),
    });
    expect(withId).toHaveBeenCalledWith({ ID: "order-1" });
    expect(post).toHaveBeenCalledWith({
      body: { version: 1, actions: [{ action: "changePaymentState", paymentState: "Paid" }] },
    });
  });

  it("compares against taxedPrice.totalGross when the order has one", async () => {
    const { client, post } = setup([
      order({
        totalPrice: { centAmount: 1000, currencyCode: "PLN" },
        taxedPrice: { totalGross: { centAmount: 1230, currencyCode: "PLN" } },
        paymentInfo: { payments: [payment("p", 1230, [charge(1230)])] },
      }),
    ]);
    const outcome = await new OrderPaymentStateSync({ client, sleep }).syncOnce("p");
    expect(outcome).toBe("updated");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("ignores an abandoned sibling payment (card + BLIK are created together)", async () => {
    const { client, post } = setup([
      order({
        paymentInfo: {
          payments: [
            payment("pay-card", 1000, [
              { type: "Authorization", state: "Initial", amount: { centAmount: 1000, currencyCode: "PLN" } },
            ]),
            payment("pay-blik", 1000, [charge(1000)]),
          ],
        },
      }),
    ]);
    const outcome = await new OrderPaymentStateSync({ client, sleep }).syncOnce("pay-blik");
    expect(outcome).toBe("updated");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("does not double count duplicate charges to reach the total", async () => {
    const { client, post } = setup([
      order({ paymentInfo: { payments: [payment("p", 1000, [charge(600), charge(600)])] } }),
    ]);
    const outcome = await new OrderPaymentStateSync({ client, sleep }).syncOnce("p");
    expect(outcome).toBe("not-paid");
    expect(post).not.toHaveBeenCalled();
  });

  it("does not mark Paid on an authorization-only success", async () => {
    const { client, post } = setup([
      order({
        paymentInfo: {
          payments: [
            payment("p", 1000, [
              { type: "Authorization", state: "Success", amount: { centAmount: 1000, currencyCode: "PLN" } },
            ]),
          ],
        },
      }),
    ]);
    expect(await new OrderPaymentStateSync({ client, sleep }).syncOnce("p")).toBe("not-paid");
    expect(post).not.toHaveBeenCalled();
  });

  it("does not mark Paid when the charge is in a different currency", async () => {
    const { client, post } = setup([
      order({
        paymentInfo: {
          payments: [
            payment("p", 1000, [
              { type: "Charge", state: "Success", amount: { centAmount: 1000, currencyCode: "EUR" } },
            ]),
          ],
        },
      }),
    ]);
    expect(await new OrderPaymentStateSync({ client, sleep }).syncOnce("p")).toBe("not-paid");
    expect(post).not.toHaveBeenCalled();
  });

  it("is a no-op when the order is already Paid", async () => {
    const { client, post } = setup([order({ paymentState: "Paid" })]);
    expect(await new OrderPaymentStateSync({ client, sleep }).syncOnce("pay-card")).toBe("already-paid");
    expect(post).not.toHaveBeenCalled();
  });

  it("reports no-order when Checkout has not created the order yet", async () => {
    const { client, post } = setup([[]]);
    expect(await new OrderPaymentStateSync({ client, sleep }).syncOnce("pay-card")).toBe("no-order");
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses to guess when several orders reference the payment", async () => {
    const { client, post } = setup([[order(), order({ id: "order-2" })]]);
    expect(await new OrderPaymentStateSync({ client, sleep }).syncOnce("pay-card")).toBe("ambiguous");
    expect(post).not.toHaveBeenCalled();
  });

  it("re-reads the order and retries when commercetools reports a concurrent modification", async () => {
    const { client, get, post } = setup([[order({ version: 1 })], [order({ version: 2 })]]);
    post
      .mockReturnValueOnce({
        execute: async () => {
          throw Object.assign(new Error("conflict"), { statusCode: 409 });
        },
      })
      .mockReturnValueOnce({ execute: async () => ({ body: {} }) });

    const outcome = await new OrderPaymentStateSync({ client, sleep }).syncOnce("pay-card");

    expect(outcome).toBe("updated");
    expect(get).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith({
      body: { version: 2, actions: [{ action: "changePaymentState", paymentState: "Paid" }] },
    });
  });
});

describe("OrderPaymentStateSync.syncWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits for the order to appear, then sets Paid", async () => {
    const { client, post } = setup([[], [], [order()]]);
    const outcome = await new OrderPaymentStateSync({
      client,
      sleep,
      retryDelaysMs: [10, 20, 30],
    }).syncWithRetry("pay-card");

    expect(outcome).toBe("updated");
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 20);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("gives up with no-order once the delays are exhausted", async () => {
    const { client, post } = setup([[]]);
    const outcome = await new OrderPaymentStateSync({
      client,
      sleep,
      retryDelaysMs: [10, 20],
    }).syncWithRetry("pay-card");

    expect(outcome).toBe("no-order");
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(post).not.toHaveBeenCalled();
  });

  it("never rejects: a commercetools failure is reported as an error outcome", async () => {
    const get = vi.fn(() => ({
      execute: async () => {
        throw new Error("boom");
      },
    }));
    const client = { orders: () => ({ get, withId: vi.fn() }) } as unknown as CommercetoolsOrderClient;

    await expect(
      new OrderPaymentStateSync({ client, sleep }).syncWithRetry("pay-card"),
    ).resolves.toBe("error");
  });
});
