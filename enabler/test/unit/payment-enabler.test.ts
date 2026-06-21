import { afterEach, describe, expect, it, vi } from "vitest";
import { apiService } from "../../src/services/api-service";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";
import * as pe from "../../src/payment-enabler/payment-enabler";

function makeEnablerOptions(overrides: Partial<EnablerOptions> = {}): EnablerOptions {
  return {
    processorUrl: "https://localhost:8080",
    sessionId: "session-123",
    merchantId: "merchant-123",
    merchantSiteId: "site-456",
    env: "test",
    ...overrides,
  };
}

function expectSafeSetupError(fn: () => unknown, field: string): pe.PaymentSetupError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(pe.PaymentSetupError);
    const setupError = error as pe.PaymentSetupError;
    expect(setupError.toPublicError()).toEqual({
      code: pe.PublicPaymentErrorCode.CONFIG_INVALID,
      message: expect.stringContaining(field),
    });
    expect(setupError.message).not.toContain("session-123");
    expect(setupError.message).not.toContain("merchant-123");
    expect(setupError.message).not.toContain("site-456");
    expect(setupError.message).not.toContain("secret-token");
    return setupError;
  }
  throw new Error("Expected validation to throw");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("validateEnablerOptions", () => {
  it("does not throw for valid options", () => {
    expect(() => pe.validateEnablerOptions(makeEnablerOptions())).not.toThrow();
  });

  it.each([
    ["processorUrl", { processorUrl: "" }],
    ["processorUrl", { processorUrl: undefined as unknown as string }],
    ["processorUrl", { processorUrl: "not-a-url?token=secret-token" }],
    ["sessionId", { sessionId: "" }],
    ["merchantId", { merchantId: "" }],
    ["merchantSiteId", { merchantSiteId: "" }],
    ["env", { env: "staging" as EnablerOptions["env"] }],
  ] satisfies Array<[string, Partial<EnablerOptions>]>)(
    "throws safe CONFIG_INVALID for invalid %s",
    (field, overrides) => {
      const error = expectSafeSetupError(
        () => pe.validateEnablerOptions(makeEnablerOptions(overrides)),
        field,
      );
      expect(error.code).toBe(pe.PublicPaymentErrorCode.CONFIG_INVALID);
      expect(error.diagnostics).toEqual(expect.objectContaining({ field }));
    },
  );

  it("accepts env = production", () => {
    expect(() =>
      pe.validateEnablerOptions(makeEnablerOptions({ env: "production" })),
    ).not.toThrow();
  });
});

describe("enabler mirrored method registry", () => {
  it("contains card component and embedded drop-in in deterministic order", () => {
    expect(pe.PaymentMethod.card).toBe("card");
    expect(pe.PaymentMethod.embedded).toBe("embedded");
    expect(pe.SUPPORTED_PAYMENT_METHODS).toEqual(["card", "embedded"]);
    expect(pe.PAYMENT_METHOD_REGISTRY.map((entry) => entry.key)).toEqual(["card", "embedded"]);
  });

  it("keeps PSP metadata empty for the card and embedded entries", () => {
    expect(pe.PAYMENT_METHOD_REGISTRY).toEqual([
      expect.objectContaining({
        key: "card",
        kind: "component",
        advertisedType: "card",
        transitional: false,
        pspMetadata: {},
      }),
      expect.objectContaining({
        key: "embedded",
        kind: "dropin",
        advertisedType: "embedded",
        transitional: false,
        pspMetadata: {},
      }),
    ]);
  });
});

describe("apiService", () => {
  it("preserves processor safe create-payment errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: pe.PublicPaymentErrorCode.METHOD_UNSUPPORTED,
            message: "Unsupported payment method. Supported methods: card.",
          }),
          { status: 400, statusText: "Bad Request" },
        ),
      ),
    );

    await expect(
      apiService({
        baseApi: "https://processor.example.com",
        sessionId: "session-123",
      }).createPayment({
        paymentMethodOptions: { paypal: {} },
      }),
    ).rejects.toMatchObject({
      code: pe.PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      message: "Unsupported payment method. Supported methods: card.",
    });
  });

  it("uses a generic safe create-payment error when the processor response is not public", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("raw backend failure secret-token", { status: 500 })),
    );

    await expect(
      apiService({
        baseApi: "https://processor.example.com",
        sessionId: "session-123",
      }).createPayment(),
    ).rejects.toMatchObject({
      code: pe.PublicPaymentErrorCode.REQUEST_MALFORMED,
      message: "Failed to create payment session.",
    });
  });
});

describe("EnablerOptions onPending", () => {
  it("validateEnablerOptions does not throw when onPending is omitted", () => {
    expect(() => pe.validateEnablerOptions(makeEnablerOptions())).not.toThrow();
  });

  it("validateEnablerOptions does not throw when onPending is provided", () => {
    const onPending = vi.fn();
    expect(() => pe.validateEnablerOptions(makeEnablerOptions({ onPending }))).not.toThrow();
  });

});
