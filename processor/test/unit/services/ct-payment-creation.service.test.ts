import { afterEach, describe, expect, it, vi } from "vitest";
import { CtPaymentCreationService } from "../../../src/services/ct-payment-creation.service";
import { NUVEI_PAYMENT_INTERFACE } from "../../../src/constants";
import * as contextModule from "../../../src/libs/fastify/context/context";

describe("CtPaymentCreationService", () => {
  it("uses requested payment method in created payment metadata", async () => {
    const createPayment = vi.fn().mockResolvedValue({ id: "payment-1" });
    const addPayment = vi.fn().mockResolvedValue(undefined);
    const service = new CtPaymentCreationService({
      ctCartService: { addPayment } as any,
      ctPaymentService: { createPayment } as any,
    });

    await service.handleCtPaymentCreation({
      interactionId: "session-1",
      amountPlanned: { centAmount: 1000, currencyCode: "USD" },
      cart: { id: "cart-1", version: 1 } as any,
      paymentMethod: "card",
    });

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodInfo: {
          paymentInterface: NUVEI_PAYMENT_INTERFACE,
          method: "card",
          name: { en: "Nuvei card" },
        },
      }),
    );
  });

  it("stores card semantics for embedded drop-in payment metadata", async () => {
    const createPayment = vi.fn().mockResolvedValue({ id: "payment-1" });
    const addPayment = vi.fn().mockResolvedValue(undefined);
    const service = new CtPaymentCreationService({
      ctCartService: { addPayment } as any,
      ctPaymentService: { createPayment } as any,
    });

    await service.handleCtPaymentCreation({
      interactionId: "session-1",
      amountPlanned: { centAmount: 1000, currencyCode: "USD" },
      cart: { id: "cart-1", version: 1 } as any,
      paymentMethod: "embedded",
    });

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodInfo: {
          paymentInterface: NUVEI_PAYMENT_INTERFACE,
          method: "card",
          name: { en: "Nuvei Simply Connect" },
        },
      }),
    );
  });

  it("creates BLIK payments with Charge Initial semantics", async () => {
    const createPayment = vi.fn().mockResolvedValue({ id: "payment-1" });
    const addPayment = vi.fn().mockResolvedValue(undefined);
    const service = new CtPaymentCreationService({
      ctCartService: { addPayment } as any,
      ctPaymentService: { createPayment } as any,
    });

    await service.handleCtPaymentCreation({
      interactionId: "session-1",
      amountPlanned: { centAmount: 1000, currencyCode: "PLN" },
      cart: { id: "cart-1", version: 1 } as any,
      paymentMethod: "blik",
    });

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodInfo: {
          paymentInterface: NUVEI_PAYMENT_INTERFACE,
          method: "blik",
          name: { en: "BLIK" },
        },
        transactions: [
          {
            type: "Charge",
            amount: { centAmount: 1000, currencyCode: "PLN" },
            state: "Initial",
            interactionId: "session-1",
          },
        ],
      }),
    );
  });

  it("sets the Payment key when a paymentKey is provided", async () => {
    const createPayment = vi.fn().mockResolvedValue({ id: "payment-1" });
    const service = new CtPaymentCreationService({
      ctCartService: { addPayment: vi.fn().mockResolvedValue(undefined) } as any,
      ctPaymentService: { createPayment } as any,
    });

    await service.handleCtPaymentCreation({
      interactionId: "session-1",
      amountPlanned: { centAmount: 1000, currencyCode: "PLN" },
      cart: { id: "cart-1", version: 1 } as any,
      paymentMethod: "card",
      paymentKey: "nuvei-4402057979221",
    });

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ key: "nuvei-4402057979221" }),
    );
  });

  it("omits the Payment key entirely when none is provided", async () => {
    const createPayment = vi.fn().mockResolvedValue({ id: "payment-1" });
    const service = new CtPaymentCreationService({
      ctCartService: { addPayment: vi.fn().mockResolvedValue(undefined) } as any,
      ctPaymentService: { createPayment } as any,
    });

    await service.handleCtPaymentCreation({
      interactionId: "session-1",
      amountPlanned: { centAmount: 1000, currencyCode: "PLN" },
      cart: { id: "cart-1", version: 1 } as any,
      paymentMethod: "card",
    });

    expect(createPayment.mock.calls[0][0]).not.toHaveProperty("key");
  });
});

describe("CtPaymentCreationService payment interface", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildService() {
    const createPayment = vi.fn().mockResolvedValue({ id: "payment-1" });
    const addPayment = vi.fn().mockResolvedValue(undefined);
    const service = new CtPaymentCreationService({
      ctCartService: { addPayment } as any,
      ctPaymentService: { createPayment } as any,
    });
    return { service, createPayment };
  }

  it("uses the Checkout session payment interface when present", async () => {
    vi.spyOn(contextModule, "getPaymentInterfaceFromContext").mockReturnValue(
      "11111111-2222-4333-8444-555555555555",
    );
    const { service, createPayment } = buildService();

    await service.handleCtPaymentCreation({
      interactionId: "session-1",
      amountPlanned: { centAmount: 1000, currencyCode: "EUR" },
      cart: { id: "cart-1", version: 1 } as any,
      paymentMethod: "card",
    });

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodInfo: expect.objectContaining({
          paymentInterface: "11111111-2222-4333-8444-555555555555",
        }),
      }),
    );
  });

  it("falls back to the static connector interface outside Checkout sessions", async () => {
    vi.spyOn(contextModule, "getPaymentInterfaceFromContext").mockReturnValue(undefined);
    const { service, createPayment } = buildService();

    await service.handleCtPaymentCreation({
      interactionId: "session-2",
      amountPlanned: { centAmount: 1000, currencyCode: "EUR" },
      cart: { id: "cart-2", version: 1 } as any,
    });

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodInfo: expect.objectContaining({
          paymentInterface: NUVEI_PAYMENT_INTERFACE,
        }),
      }),
    );
  });
});
