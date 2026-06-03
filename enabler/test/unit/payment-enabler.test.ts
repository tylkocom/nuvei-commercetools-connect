import { afterEach, describe, expect, it, vi } from "vitest";
import { NuveiEnabler, NuveiSimplyConnectEnabler, NuveiWebSdkEnabler } from "../../src/index";
import { apiService } from "../../src/services/api-service";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";
import * as pe from "../../src/payment-enabler/payment-enabler";
import * as scSdk from "../../src/services/simply-connect-sdk";
import * as wsSdk from "../../src/services/web-sdk";

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
  it("contains only card in deterministic order", () => {
    expect(pe.PaymentMethod.card).toBe("card");
    expect(pe.SUPPORTED_PAYMENT_METHODS).toEqual(["card"]);
    expect(pe.PAYMENT_METHOD_REGISTRY.map((entry) => entry.key)).toEqual(["card"]);
  });

  it("keeps PSP metadata empty for the card entry", () => {
    expect(pe.PAYMENT_METHOD_REGISTRY).toEqual([
      expect.objectContaining({
        key: "card",
        kind: "component",
        advertisedType: "card",
        transitional: false,
        pspMetadata: {},
      }),
    ]);
  });
});

describe("NuveiSimplyConnectEnabler", () => {
  it("creates a card component builder", async () => {
    const enabler = new NuveiSimplyConnectEnabler(makeEnablerOptions());

    const builder = await enabler.createComponentBuilder("card");

    expect(builder.componentHasSubmit).toBe(false);
    expect(typeof builder.build).toBe("function");
  });

  it("rejects unsupported component types before SDK or processor side effects", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const loadSimplyConnectSpy = vi.spyOn(scSdk, "loadSimplyConnectSdk");
    const loadWebSdkSpy = vi.spyOn(wsSdk, "loadWebSdk");
    const enabler = new NuveiSimplyConnectEnabler(makeEnablerOptions());

    await expect(enabler.createComponentBuilder("paypal")).rejects.toMatchObject({
      code: pe.PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      message: expect.stringContaining("Supported methods: card"),
    });
    expect(loadSimplyConnectSpy).not.toHaveBeenCalled();
    expect(loadWebSdkSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("NuveiWebSdkEnabler", () => {
  it("creates a card component builder", async () => {
    const enabler = new NuveiWebSdkEnabler(makeEnablerOptions());

    const builder = await enabler.createComponentBuilder("card");

    expect(builder.componentHasSubmit).toBe(true);
    expect(typeof builder.build).toBe("function");
  });
});

describe("NuveiEnabler facade mode validation", () => {
  it("accepts 'simply-connect' mode", () => {
    expect(() => new NuveiEnabler(makeEnablerOptions(), "simply-connect")).not.toThrow();
  });

  it("accepts 'web-sdk' mode", () => {
    expect(() => new NuveiEnabler(makeEnablerOptions(), "web-sdk")).not.toThrow();
  });

  it("throws METHOD_UNSUPPORTED before any side effect when mode is undefined", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const loadSimplyConnectSpy = vi.spyOn(scSdk, "loadSimplyConnectSdk");
    const loadWebSdkSpy = vi.spyOn(wsSdk, "loadWebSdk");
    const explosiveOpts = Object.defineProperty({}, "processorUrl", {
      get() {
        throw new Error("validateEnablerOptions should not run");
      },
      configurable: true,
    }) as EnablerOptions;

    expect(
      () => new NuveiEnabler(explosiveOpts, undefined as unknown as "simply-connect" | "web-sdk"),
    ).toThrow(pe.PaymentSetupError);
    expect(loadSimplyConnectSpy).not.toHaveBeenCalled();
    expect(loadWebSdkSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws METHOD_UNSUPPORTED for unsupported mode 'hpp'", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const loadSimplyConnectSpy = vi.spyOn(scSdk, "loadSimplyConnectSdk");
    const loadWebSdkSpy = vi.spyOn(wsSdk, "loadWebSdk");
    const explosiveOpts = Object.defineProperty({}, "processorUrl", {
      get() {
        throw new Error("validateEnablerOptions should not run");
      },
      configurable: true,
    }) as EnablerOptions;

    expect(
      () => new NuveiEnabler(explosiveOpts, "hpp" as unknown as "simply-connect" | "web-sdk"),
    ).toThrow(pe.PaymentSetupError);
    expect(loadSimplyConnectSpy).not.toHaveBeenCalled();
    expect(loadWebSdkSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws METHOD_UNSUPPORTED for empty string mode", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const loadSimplyConnectSpy = vi.spyOn(scSdk, "loadSimplyConnectSdk");
    const loadWebSdkSpy = vi.spyOn(wsSdk, "loadWebSdk");
    const explosiveOpts = Object.defineProperty({}, "processorUrl", {
      get() {
        throw new Error("validateEnablerOptions should not run");
      },
      configurable: true,
    }) as EnablerOptions;

    expect(
      () => new NuveiEnabler(explosiveOpts, "" as unknown as "simply-connect" | "web-sdk"),
    ).toThrow(pe.PaymentSetupError);
    expect(loadSimplyConnectSpy).not.toHaveBeenCalled();
    expect(loadWebSdkSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("delegates createComponentBuilder to the simply connect mode", async () => {
    const enabler = new NuveiEnabler(makeEnablerOptions(), "simply-connect");
    const builder = await enabler.createComponentBuilder(pe.PaymentMethod.card);
    expect(builder.componentHasSubmit).toBe(false);
  });

  it("delegates createComponentBuilder to the web sdk mode", async () => {
    const enabler = new NuveiEnabler(makeEnablerOptions(), "web-sdk");
    const builder = await enabler.createComponentBuilder(pe.PaymentMethod.card);
    expect(builder.componentHasSubmit).toBe(true);
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

  it("NuveiSimplyConnectEnabler construction succeeds with onPending in options", () => {
    const onPending = vi.fn();
    expect(() => new NuveiSimplyConnectEnabler(makeEnablerOptions({ onPending }))).not.toThrow();
  });

  it("NuveiWebSdkEnabler construction succeeds with onPending in options", () => {
    const onPending = vi.fn();
    expect(() => new NuveiWebSdkEnabler(makeEnablerOptions({ onPending }))).not.toThrow();
  });
});
