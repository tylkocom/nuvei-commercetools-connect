import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pairs the two halves of the Payment-key correlation with the real code on both
 * sides: the key written when a session is created (CtPaymentCreationService fed
 * with an openOrder response) and the key looked up when a DMN arrives
 * (NuveiDmnReconciler). A drift between them (prefix, number vs string, where the
 * key is placed on the draft) would make every DMN silently fall back to the
 * legacy cart scan, which the individual unit tests cannot detect.
 *
 * The identifiers are taken from the production processor log of 2026-11-21:
 * the openOrder response `orderId` 4402057979221 came back on the DMN as
 * `PPP_TransactionID` 4402057979221 (PENDING, then APPROVED).
 *
 * This is NOT sandbox evidence: it proves the processor is self-consistent for the
 * observed Nuvei shapes, not that Nuvei sends the same ids for every method.
 */

const mockNuveiClientInstance = {
  validateDmnChecksum: vi.fn(),
  getPaymentStatus: vi.fn(),
};

vi.mock("../../../src/clients/nuvei.client", () => ({
  nuveiClient: () => mockNuveiClientInstance,
}));

vi.mock("../../../src/config/config", () => ({
  getConfig: () => ({
    nuveiMerchantId: "merchant-123",
    nuveiMerchantSiteId: "site-456",
    nuveiDmnChecksumAlgorithm: "sha256",
    projectKey: "test-project",
  }),
  config: {},
}));

vi.mock("../../../src/libs/logger/index", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../src/libs/fastify/context/context", () => ({
  getPaymentInterfaceFromContext: () => "checkout-session-interface",
}));

const mockConvertDmnToPaymentUpdate = vi.fn();
vi.mock("../../../src/services/converters/nuvei-event.converter", () => ({
  NuveiEventConverter: class {
    convertDmnToPaymentUpdate = mockConvertDmnToPaymentUpdate;
  },
}));

import { CtPaymentCreationService } from "../../../src/services/ct-payment-creation.service";
import { NuveiDmnReconciler } from "../../../src/services/dmn-reconciler";
import { nuveiPaymentKeyFromOrder } from "../../../src/services/nuvei-payment-key";

const CART_ID = "559cf473-8cba-4f1f-a8ab-8cc8de248aa5";
const AMOUNT = { centAmount: 1964, currencyCode: "PLN" };

/** Shapes copied from the production log. */
const openOrderResponses = {
  card: { status: "SUCCESS", errCode: 0, orderId: 4402057971221, sessionToken: "card-session-token" },
  blik: { status: "SUCCESS", errCode: 0, orderId: 4402057979221, sessionToken: "blik-session-token" },
} as const;

function dmnFor(orderId: number, overrides: Record<string, unknown> = {}) {
  return {
    merchant_id: "merchant-123",
    merchant_site_id: "site-456",
    merchant_unique_id: CART_ID,
    clientUniqueId: CART_ID,
    PPP_TransactionID: String(orderId),
    TransactionID: "2630000000541867549",
    transactionType: "Sale",
    ppp_status: "OK",
    Status: "APPROVED",
    totalAmount: "19.64",
    currency: "PLN",
    ...overrides,
  };
}

describe("Payment key round trip (session creation -> DMN resolution)", () => {
  const createdByKey = new Map<string, any>();
  const createdById = new Map<string, any>();
  const getCart = vi.fn();
  const getPayment = vi.fn();
  const updatePayment = vi.fn();
  const findPaymentsByInterfaceId = vi.fn();
  const withKey = vi.fn();

  beforeEach(() => {
    createdByKey.clear();
    createdById.clear();
    getCart.mockReset();
    getPayment.mockReset();
    updatePayment.mockReset();
    findPaymentsByInterfaceId.mockReset();
    withKey.mockReset();
    mockConvertDmnToPaymentUpdate.mockReset();
    mockNuveiClientInstance.validateDmnChecksum.mockReset().mockReturnValue(true);
    mockNuveiClientInstance.getPaymentStatus.mockReset();

    withKey.mockImplementation(({ key }: { key: string }) => ({
      get: () => ({
        execute: async () => {
          const payment = createdByKey.get(key);
          if (!payment) throw Object.assign(new Error("not found"), { statusCode: 404 });
          return { body: payment };
        },
      }),
    }));
    getPayment.mockImplementation(async ({ id }: { id: string }) => {
      const payment = createdById.get(id);
      if (!payment) throw new Error(`The Resource with ID '${id}' was not found.`);
      return payment;
    });
  });

  async function createSession(method: "card" | "blik") {
    const response = openOrderResponses[method];
    let counter = createdById.size;
    const creation = new CtPaymentCreationService({
      ctCartService: { addPayment: vi.fn().mockResolvedValue(undefined) } as any,
      ctPaymentService: {
        createPayment: vi.fn(async (draft: any) => {
          counter += 1;
          const payment = { id: `ct-payment-${counter}`, version: 1, ...draft };
          createdById.set(payment.id, payment);
          if (draft.key) createdByKey.set(draft.key, payment);
          return payment;
        }),
      } as any,
    });
    const paymentId = await creation.handleCtPaymentCreation({
      interactionId: response.sessionToken,
      amountPlanned: AMOUNT,
      cart: { id: CART_ID, version: 1 } as any,
      paymentMethod: method,
      tender: method,
      // Exactly how createPaymentSession derives it from the openOrder response.
      paymentKey: nuveiPaymentKeyFromOrder(response.orderId),
    });
    return { paymentId, response };
  }

  function makeReconciler() {
    return new NuveiDmnReconciler({
      ctCartService: { getCart } as any,
      ctPaymentService: { getPayment, updatePayment, findPaymentsByInterfaceId } as any,
      ctPaymentClient: { payments: () => ({ withKey }) } as any,
    });
  }

  function arrangeApproval(method: "card" | "blik", paymentId: string, sessionToken: string) {
    mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
      status: "SUCCESS",
      transactionStatus: "APPROVED",
      sessionToken,
      transactionId: "2630000000541867549",
      amount: "19.64",
      currency: "PLN",
      clientUniqueId: CART_ID,
    });
    mockConvertDmnToPaymentUpdate.mockImplementation((body: Record<string, unknown>) => ({
      id: String(body.merchant_unique_id),
      pspReference: String(body.PPP_TransactionID),
      transactions: [
        {
          type: method === "blik" ? "Charge" : "Authorization",
          interactionId: String(body.PPP_TransactionID),
          amount: AMOUNT,
          state: "Success",
        },
      ],
      interfaceCode: "paid",
      paymentMethod: method,
      paymentMethodName: { en: method },
    }));
    return paymentId;
  }

  it.each(["card", "blik"] as const)(
    "resolves the %s Payment created from an openOrder response via its DMN, without touching the cart",
    async (method) => {
      // The abandoned sibling of the other method is on the same cart and also keyed.
      const other = method === "card" ? "blik" : "card";
      await createSession(other);
      const { paymentId, response } = await createSession(method);
      arrangeApproval(method, paymentId, response.sessionToken);

      await makeReconciler().process(dmnFor(response.orderId));

      expect(withKey).toHaveBeenCalledWith({ key: `nuvei-${response.orderId}` });
      expect(getCart).not.toHaveBeenCalled();
      expect(mockConvertDmnToPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ merchant_unique_id: paymentId }),
        AMOUNT.centAmount,
      );
      expect(updatePayment).toHaveBeenCalledWith(expect.objectContaining({ id: paymentId }));
    },
  );

  it("resolves both the PENDING and the APPROVED DMN of the same order to the same Payment", async () => {
    const { paymentId, response } = await createSession("blik");
    arrangeApproval("blik", paymentId, response.sessionToken);
    const reconciler = makeReconciler();

    await reconciler.process(dmnFor(response.orderId, { ppp_status: "PENDING", Status: "PENDING" }));
    await reconciler.process(dmnFor(response.orderId));

    expect(withKey).toHaveBeenCalledTimes(2);
    expect(withKey).toHaveBeenNthCalledWith(1, { key: `nuvei-${response.orderId}` });
    expect(withKey).toHaveBeenNthCalledWith(2, { key: `nuvei-${response.orderId}` });
    expect(getCart).not.toHaveBeenCalled();
  });

  it("does not match a different order's key", async () => {
    const { response } = await createSession("card");
    getCart.mockResolvedValue({ id: CART_ID, version: 1, paymentInfo: { payments: [] } });

    await expect(
      makeReconciler().process(dmnFor(response.orderId + 1)),
    ).rejects.toThrow();

    expect(withKey).toHaveBeenCalledWith({ key: `nuvei-${response.orderId + 1}` });
    expect(updatePayment).not.toHaveBeenCalled();
  });
});
