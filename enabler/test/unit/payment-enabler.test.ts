import { describe, expect, it, vi, afterEach } from "vitest";
import { NuveiEnabler } from "../../src/index";
import { apiService } from "../../src/services/api-service";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";
import {
  DropinType,
  PAYMENT_METHOD_REGISTRY,
  PaymentMethod,
  PaymentSetupError,
  PublicPaymentErrorCode,
  SUPPORTED_PAYMENT_METHODS,
  validateEnablerOptions,
} from "../../src/payment-enabler/payment-enabler";
import * as nuveiSdk from "../../src/services/nuvei-sdk";

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

function expectSafeSetupError(fn: () => unknown, field: string): PaymentSetupError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentSetupError);
    const setupError = error as PaymentSetupError;
    expect(setupError.toPublicError()).toEqual({
      code: PublicPaymentErrorCode.CONFIG_INVALID,
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

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe("validateEnablerOptions", () => {
  it("does not throw for valid options", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions())).not.toThrow();
  });

  it.each([
    ["processorUrl", { processorUrl: "" }],
    ["processorUrl", { processorUrl: undefined as unknown as string }],
    ["processorUrl", { processorUrl: "not-a-url?token=secret-token" }],
    ["sessionId", { sessionId: "" }],
    ["merchantId", { merchantId: "" }],
    ["merchantSiteId", { merchantSiteId: "" }],
    ["env", { env: "staging" as EnablerOptions["env"] }],
  ] satisfies Array<[string, Partial<EnablerOptions>]>) (
    "throws safe CONFIG_INVALID for invalid %s",
    (field, overrides) => {
      const error = expectSafeSetupError(
        () => validateEnablerOptions(makeEnablerOptions(overrides)),
        field,
      );
      expect(error.code).toBe(PublicPaymentErrorCode.CONFIG_INVALID);
      expect(error.diagnostics).toEqual(expect.objectContaining({ field }));
    },
  );

  it("accepts env = production", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions({ env: "production" }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Payment registry tests
// ---------------------------------------------------------------------------

describe("enabler mirrored method registry", () => {
  it("contains card and transitional embedded in deterministic order", () => {
    expect(PaymentMethod.card).toBe("card");
    expect(PaymentMethod.embedded).toBe("embedded");
    expect(SUPPORTED_PAYMENT_METHODS).toEqual(["card", "embedded"]);
    expect(PAYMENT_METHOD_REGISTRY.map((entry) => entry.key)).toEqual(["card", "embedded"]);
  });

  it("keeps PSP metadata empty for every Phase 1 entry", () => {
    expect(PAYMENT_METHOD_REGISTRY).toEqual([
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
        transitional: true,
        pspMetadata: {},
      }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// NuveiEnabler integration tests
// ---------------------------------------------------------------------------

describe("NuveiEnabler", () => {
  it("creates a card component builder", async () => {
    const enabler = new NuveiEnabler(makeEnablerOptions());

    const builder = await enabler.createComponentBuilder("card");

    expect(builder.componentHasSubmit).toBe(false);
    expect(typeof builder.build).toBe("function");
  });

  it("creates an embedded drop-in builder", async () => {
    const enabler = new NuveiEnabler(makeEnablerOptions());

    const builder = await enabler.createDropinBuilder(DropinType.embedded);

    expect(builder.dropinHasSubmit).toBe(false);
    expect(typeof builder.build).toBe("function");
  });

  it("creates builders for every registry-advertised method", async () => {
    const enabler = new NuveiEnabler(makeEnablerOptions());

    for (const entry of PAYMENT_METHOD_REGISTRY) {
      if (entry.kind === "component") {
        const builder = await enabler.createComponentBuilder(entry.advertisedType);
        expect(builder.componentHasSubmit).toBe(false);
        expect(typeof builder.build).toBe("function");
        continue;
      }

      const builder = await enabler.createDropinBuilder(entry.advertisedType);
      expect(builder.dropinHasSubmit).toBe(false);
      expect(typeof builder.build).toBe("function");
      expect(entry.transitional).toBe(true);
    }
  });

  it("rejects unsupported component types before SDK or processor side effects", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const loadSpy = vi.spyOn(nuveiSdk, "loadNuveiSdk");
    const enabler = new NuveiEnabler(makeEnablerOptions());

    await expect(enabler.createComponentBuilder("paypal")).rejects.toMatchObject({
      code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      message: expect.stringContaining("Supported methods: card, embedded"),
    });
    expect(loadSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects unsupported drop-in types before SDK or processor side effects", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const loadSpy = vi.spyOn(nuveiSdk, "loadNuveiSdk");
    const enabler = new NuveiEnabler(makeEnablerOptions());

    await expect(enabler.createDropinBuilder("hpp")).rejects.toMatchObject({
      code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      message: expect.stringContaining("Supported methods: card, embedded"),
    });
    expect(loadSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws on construction with invalid options", () => {
    const error = expectSafeSetupError(
      () => new NuveiEnabler(makeEnablerOptions({ sessionId: "" })),
      "sessionId",
    );
    expect(error.code).toBe(PublicPaymentErrorCode.CONFIG_INVALID);
  });
});

describe("apiService", () => {
  it("preserves processor safe create-payment errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
            message: "Unsupported payment method. Supported methods: card, embedded.",
          }),
          { status: 400, statusText: "Bad Request" },
        ),
      ),
    );

    await expect(
      apiService({ baseApi: "https://processor.example.com", sessionId: "session-123" }).createPayment({
        paymentMethodOptions: { paypal: {} },
      }),
    ).rejects.toMatchObject({
      code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      message: "Unsupported payment method. Supported methods: card, embedded.",
    });
  });

  it("uses a generic safe create-payment error when the processor response is not public", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("raw backend failure secret-token", { status: 500 })),
    );

    await expect(
      apiService({ baseApi: "https://processor.example.com", sessionId: "session-123" }).createPayment(),
    ).rejects.toMatchObject({
      code: PublicPaymentErrorCode.REQUEST_MALFORMED,
      message: "Failed to create payment session.",
    });
  });
});
