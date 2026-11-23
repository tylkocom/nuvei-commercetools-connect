import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetPaymentStatus } = vi.hoisted(() => ({ mockGetPaymentStatus: vi.fn() }));

vi.mock("../../../src/clients/nuvei.client", () => {
  class NuveiApiError extends Error {
    public readonly errCode?: number | string;
    public constructor(body: { errCode?: number | string; reason?: string }) {
      super(body.reason ?? "Nuvei API request failed");
      this.errCode = body.errCode;
    }
  }
  return { NuveiApiError, nuveiClient: () => ({ getPaymentStatus: mockGetPaymentStatus }) };
});

vi.mock("../../../src/libs/logger/index", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NuveiApiError } from "../../../src/clients/nuvei.client";
import {
  NUVEI_NO_PAYMENT_ERR_CODE,
  STALE_PAYMENT_MIN_AGE_MS,
  StalePaymentCleaner,
} from "../../../src/services/stale-payment-cleanup";

const NOW = Date.parse("2026-11-21T10:52:00.000Z");
const OLD = new Date(NOW - STALE_PAYMENT_MIN_AGE_MS - 1_000).toISOString();
const FRESH = new Date(NOW - 5_000).toISOString();

function makePayment(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) ?? "stale-1";
  const sessionToken = (overrides.interfaceId as string) ?? `session-${id}`;
  return {
    id,
    interfaceId: sessionToken,
    createdAt: OLD,
    paymentMethodInfo: { paymentInterface: "checkout-x", method: "card" },
    transactions: [{ type: "Authorization", state: "Initial", interactionId: sessionToken }],
    ...overrides,
  } as any;
}

function noPaymentError() {
  return new NuveiApiError({
    errCode: NUVEI_NO_PAYMENT_ERR_CODE,
    reason: "A payment was not performed during this session",
  } as any);
}

function setup(opts: {
  linked: string[];
  payments: Record<string, unknown>;
  postImpl?: ReturnType<typeof vi.fn>;
  latestLinked?: string[];
}) {
  const getPayment = vi.fn(async ({ id }: { id: string }) => {
    const payment = opts.payments[id];
    if (!payment) throw new Error(`payment ${id} not found`);
    return payment as any;
  });
  const cartGet = vi
    .fn()
    .mockResolvedValueOnce({
      body: {
        id: "cart-1",
        version: 10,
        paymentInfo: { payments: opts.linked.map((id) => ({ typeId: "payment", id })) },
      },
    })
    .mockResolvedValue({
      body: {
        id: "cart-1",
        version: 11,
        paymentInfo: {
          payments: (opts.latestLinked ?? opts.linked).map((id) => ({ typeId: "payment", id })),
        },
      },
    });
  const post = opts.postImpl ?? vi.fn().mockResolvedValue({ body: {} });
  const ctCartClient = {
    carts: () => ({
      withId: () => ({
        get: () => ({ execute: cartGet }),
        post: (arg: unknown) => ({ execute: () => post(arg) }),
      }),
    }),
  };
  const cleaner = new StalePaymentCleaner({
    ctPaymentService: { getPayment } as any,
    ctCartClient: ctCartClient as any,
    now: () => NOW,
  });
  return { cleaner, getPayment, post };
}

const run = (cleaner: StalePaymentCleaner, overrides: Record<string, unknown> = {}) =>
  cleaner.removeStaleSessionPayments({
    cartId: "cart-1",
    keepPaymentId: "new-1",
    method: "card",
    ...overrides,
  });

describe("StalePaymentCleaner", () => {
  beforeEach(() => {
    mockGetPaymentStatus.mockReset();
  });

  it("unlinks an unused, old, same-method session confirmed empty by Nuvei", async () => {
    mockGetPaymentStatus.mockRejectedValue(noPaymentError());
    const { cleaner, post } = setup({
      linked: ["new-1", "stale-1"],
      payments: { "new-1": makePayment({ id: "new-1" }), "stale-1": makePayment() },
    });

    await expect(run(cleaner)).resolves.toEqual(["stale-1"]);

    expect(mockGetPaymentStatus).toHaveBeenCalledTimes(1);
    expect(mockGetPaymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sessionToken: "session-stale-1" }),
    );
    expect(post).toHaveBeenCalledWith({
      body: {
        version: 10,
        actions: [{ action: "removePayment", payment: { typeId: "payment", id: "stale-1" } }],
      },
    });
  });

  it("never touches the new Payment", async () => {
    mockGetPaymentStatus.mockRejectedValue(noPaymentError());
    const { cleaner, getPayment, post } = setup({
      linked: ["new-1"],
      payments: { "new-1": makePayment({ id: "new-1" }) },
    });

    await expect(run(cleaner)).resolves.toEqual([]);

    expect(getPayment).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps the sibling payment method without calling Nuvei", async () => {
    const { cleaner, post } = setup({
      linked: ["new-1", "blik-1"],
      payments: {
        "new-1": makePayment({ id: "new-1" }),
        "blik-1": makePayment({
          id: "blik-1",
          paymentMethodInfo: { paymentInterface: "checkout-x", method: "blik" },
        }),
      },
    });

    await expect(run(cleaner)).resolves.toEqual([]);

    expect(mockGetPaymentStatus).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps sessions younger than the grace period (concurrent mounts)", async () => {
    const { cleaner, post } = setup({
      linked: ["new-1", "fresh-1"],
      payments: { "fresh-1": makePayment({ id: "fresh-1", createdAt: FRESH }) },
    });

    await expect(run(cleaner)).resolves.toEqual([]);

    expect(mockGetPaymentStatus).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    ["a Success transaction", [{ type: "Authorization", state: "Success", interactionId: "session-p" }]],
    ["a Pending transaction", [{ type: "Charge", state: "Pending", interactionId: "session-p" }]],
    ["a Failure transaction", [{ type: "Authorization", state: "Failure", interactionId: "session-p" }]],
    ["no transactions", []],
  ])("keeps a Payment with %s", async (_label, transactions) => {
    const { cleaner, post } = setup({
      linked: ["new-1", "p"],
      payments: { p: makePayment({ id: "p", interfaceId: "session-p", transactions }) },
    });

    await expect(run(cleaner)).resolves.toEqual([]);

    expect(mockGetPaymentStatus).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps a Payment that is not bound to a Nuvei session", async () => {
    const { cleaner, post } = setup({
      linked: ["new-1", "foreign"],
      payments: {
        foreign: makePayment({
          id: "foreign",
          interfaceId: "other",
          transactions: [{ type: "Authorization", state: "Initial", interactionId: "different" }],
        }),
      },
    });

    await expect(run(cleaner)).resolves.toEqual([]);

    expect(mockGetPaymentStatus).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps a Payment when Nuvei reports activity in the session (in-flight PENDING)", async () => {
    mockGetPaymentStatus.mockResolvedValue({ status: "SUCCESS", transactionStatus: "PENDING" });
    const { cleaner, post } = setup({
      linked: ["new-1", "stale-1"],
      payments: { "stale-1": makePayment() },
    });

    await expect(run(cleaner)).resolves.toEqual([]);

    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    ["a different Nuvei error code", new NuveiApiError({ errCode: 1, reason: "Invalid request" } as any)],
    ["a network failure", new Error("fetch failed")],
    ["a timeout", Object.assign(new Error("timed out"), { name: "TimeoutError" })],
  ])("keeps a Payment on %s (fail-safe)", async (_label, error) => {
    mockGetPaymentStatus.mockRejectedValue(error);
    const { cleaner, post } = setup({
      linked: ["new-1", "stale-1"],
      payments: { "stale-1": makePayment() },
    });

    await expect(run(cleaner)).resolves.toEqual([]);

    expect(post).not.toHaveBeenCalled();
  });

  it("removes only the verified payments in one cart update", async () => {
    mockGetPaymentStatus.mockImplementation(async ({ sessionToken }: { sessionToken: string }) => {
      if (sessionToken === "session-empty") throw noPaymentError();
      return { status: "SUCCESS", transactionStatus: "PENDING" };
    });
    const { cleaner, post } = setup({
      linked: ["new-1", "empty", "busy"],
      payments: {
        empty: makePayment({ id: "empty" }),
        busy: makePayment({ id: "busy" }),
      },
    });

    await expect(run(cleaner)).resolves.toEqual(["empty"]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({
      body: {
        version: 10,
        actions: [{ action: "removePayment", payment: { typeId: "payment", id: "empty" } }],
      },
    });
  });

  it("verifies at most five candidates per run", async () => {
    mockGetPaymentStatus.mockRejectedValue(noPaymentError());
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const { cleaner } = setup({
      linked: ["new-1", ...ids],
      payments: Object.fromEntries(ids.map((id) => [id, makePayment({ id })])),
    });

    const removed = await run(cleaner);

    expect(mockGetPaymentStatus).toHaveBeenCalledTimes(5);
    expect(removed).toHaveLength(5);
  });

  it("retries once on a fresh cart version when the update conflicts", async () => {
    mockGetPaymentStatus.mockRejectedValue(noPaymentError());
    const post = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("ConcurrentModification"), { statusCode: 409 }))
      .mockResolvedValue({ body: {} });
    const { cleaner } = setup({
      linked: ["new-1", "stale-1"],
      payments: { "stale-1": makePayment() },
      postImpl: post,
    });

    await expect(run(cleaner)).resolves.toEqual(["stale-1"]);

    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith({
      body: {
        version: 11,
        actions: [{ action: "removePayment", payment: { typeId: "payment", id: "stale-1" } }],
      },
    });
  });

  it("does not retry when a conflicting update already unlinked the payment", async () => {
    mockGetPaymentStatus.mockRejectedValue(noPaymentError());
    const post = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("ConcurrentModification"), { statusCode: 409 }));
    const { cleaner } = setup({
      linked: ["new-1", "stale-1"],
      latestLinked: ["new-1"],
      payments: { "stale-1": makePayment() },
      postImpl: post,
    });

    await expect(run(cleaner)).resolves.toEqual(["stale-1"]);

    expect(post).toHaveBeenCalledTimes(1);
  });
});
