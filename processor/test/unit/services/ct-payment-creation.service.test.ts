import { describe, expect, it, vi } from "vitest";
import { CtPaymentCreationService } from "../../../src/services/ct-payment-creation.service";
import { NUVEI_PAYMENT_INTERFACE } from "../../../src/constants";

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
});
