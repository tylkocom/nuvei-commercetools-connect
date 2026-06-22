import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";

const mockLoadSimplyConnectSdk = vi.hoisted(() => vi.fn());
const mockCreatePayment = vi.hoisted(() => vi.fn());
const mockConfirmPaymentResult = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/simply-connect-sdk", () => ({
  loadSimplyConnectSdk: mockLoadSimplyConnectSdk,
}));

vi.mock("../../src/services/api-service", () => ({
  apiService: vi.fn(() => ({
    createPayment: mockCreatePayment,
    confirmPayment: vi.fn(),
  })),
  confirmPaymentResult: mockConfirmPaymentResult,
}));

import { SimplyConnectDropinBuilder } from "../../src/components/simply-connect-dropin";

function makeEnablerOptions(overrides: Partial<EnablerOptions> = {}): EnablerOptions {
  return {
    processorUrl: "https://processor.example.com",
    sessionId: "session-123",
    merchantId: "merchant-123",
    merchantSiteId: "site-456",
    env: "test",
    ...overrides,
  };
}

function stubDocument() {
  const container = {
    innerHTML: "stale content",
    querySelectorAll: vi.fn().mockReturnValue([]),
  };
  vi.stubGlobal("document", {
    querySelector: vi.fn().mockReturnValue(container),
  });
  return container;
}

function mockPaymentSession() {
  mockCreatePayment.mockResolvedValue({
    sessionToken: "known-session-token",
    paymentReference: "payment-ref-123",
    amount: "10.00",
    currency: "USD",
  });
}

describe("SimplyConnectDropinBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates an embedded drop-in builder without Checkout-owned submit", () => {
    const builder = new SimplyConnectDropinBuilder(makeEnablerOptions());

    expect(builder.dropinHasSubmit).toBe(false);
    expect("componentHasSubmit" in builder).toBe(false);
    expect(typeof builder.build).toBe("function");
  });

  it("mounts Simply Connect through the embedded session contract", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onDropinReady = vi.fn().mockResolvedValue(undefined);
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const builder = new SimplyConnectDropinBuilder(makeEnablerOptions({ countryCode: "DE" }));
    const dropin = builder.build({ onDropinReady });

    await dropin.mount("#payment-container");

    expect(mockCreatePayment).toHaveBeenCalledWith({
      paymentMethodOptions: { embedded: {} },
    });
    expect(mockCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionToken: "known-session-token",
        env: "int",
        merchantId: "merchant-123",
        merchantSiteId: "site-456",
        amount: "10.00",
        currency: "USD",
        country: "DE",
        renderTo: "#payment-container",
        pmWhitelist: ["cc_card"],
        onReady: expect.any(Function),
        prePayment: expect.any(Function),
        onResult: expect.any(Function),
        onError: expect.any(Function),
        onPaymentEvent: expect.any(Function),
      }),
    );

    // merchant_unique_id is never passed client-side (checkout.js ignores it; DMN
    // correlation is server-side via sessionToken fallback).
    const configArg = mockCheckout.mock.calls[0][0] as Record<string, unknown>;
    expect(configArg).not.toHaveProperty("merchant_unique_id");
    expect(configArg).not.toHaveProperty("merchantUniqueId");
    expect(configArg).not.toHaveProperty("merchantUniqueID");
    expect(configArg).not.toHaveProperty("onPending");

    // onDropinReady is driven by Nuvei's real onReady signal, not fired eagerly.
    expect(onDropinReady).not.toHaveBeenCalled();
    (configArg as { onReady: () => void }).onReady();
    await vi.waitFor(() => expect(onDropinReady).toHaveBeenCalledOnce());
    expect(onDropinReady).toHaveBeenCalledAfter(mockCheckout);
  });

  it("mount reports onError but remains mounted when onDropinReady fails", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const readyError = new Error("host readiness failed");
    const onDropinReady = vi.fn().mockRejectedValue(readyError);
    const onError = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions({ onError })).build({
      onDropinReady,
    });

    await expect(dropin.mount("#payment-container")).resolves.toBeUndefined();
    const checkoutConfig = mockCheckout.mock.calls[0][0] as { onReady: () => void };
    checkoutConfig.onReady();

    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(readyError, { paymentReference: "payment-ref-123" }),
    );
    expect(onDropinReady).toHaveBeenCalledOnce();
    await expect(dropin.mount("#payment-container")).resolves.toBeUndefined();
    expect(mockCreatePayment).toHaveBeenCalledOnce();
  });

  it("onReady fires onDropinReady exactly once even if Nuvei emits it twice", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onDropinReady = vi.fn().mockResolvedValue(undefined);
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions()).build({ onDropinReady });
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as { onReady: () => void };
    checkoutConfig.onReady();
    checkoutConfig.onReady();

    await vi.waitFor(() => expect(onDropinReady).toHaveBeenCalledOnce());
  });

  it("onReady reports a synchronous throw from onDropinReady via onError instead of escaping", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const syncReadyError = new Error("sync readiness failure");
    const onDropinReady = vi.fn(() => {
      throw syncReadyError;
    });
    const onError = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions({ onError })).build({
      onDropinReady,
    });
    await dropin.mount("#payment-container");

    // A synchronous throw must NOT escape into the caller; it is caught and routed
    // through onError exactly like an async rejection.
    const checkoutConfig = mockCheckout.mock.calls[0][0] as { onReady: () => void };
    expect(() => checkoutConfig.onReady()).not.toThrow();

    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(syncReadyError, { paymentReference: "payment-ref-123" }),
    );
    expect(onDropinReady).toHaveBeenCalledOnce();
  });

  it("prePayment resolves to true so Nuvei proceeds after Checkout gating succeeds", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onPayButtonClick = vi.fn().mockResolvedValue(undefined);
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions()).build({ onPayButtonClick });
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      prePayment: (payload: unknown) => Promise<boolean | void>;
    };
    const maskedPayload = {
      paymentOption: { card: { ccCardNumber: "411111******1111", bin: "411111" } },
      savePM: false,
    };

    await expect(checkoutConfig.prePayment(maskedPayload)).resolves.toBe(true);
    expect(onPayButtonClick).toHaveBeenCalledOnce();
  });

  it("prePayment never forwards the Nuvei masked-card payload to onPayButtonClick", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onPayButtonClick = vi.fn().mockResolvedValue(undefined);
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions()).build({ onPayButtonClick });
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      prePayment: (payload: unknown) => Promise<boolean | void>;
    };
    const maskedPayload = {
      paymentOption: { card: { ccCardNumber: "411111******1111", ccNameOnCard: "SHOPPER" } },
    };

    await checkoutConfig.prePayment(maskedPayload);

    // onPayButtonClick receives zero arguments — the masked-card payload and its
    // sensitive fields (ccCardNumber, ccNameOnCard) must never be forwarded into
    // Checkout's gating callback.
    expect(onPayButtonClick).toHaveBeenCalledOnce();
    expect(onPayButtonClick).toHaveBeenCalledWith();
  });

  it("prePayment resolves to false when Checkout pre-submit gating throws", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const validationError = new Error("terms missing for shopper 42");
    const onPayButtonClick = vi.fn().mockRejectedValue(validationError);
    const onError = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions({ onError })).build({
      onPayButtonClick,
    });
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      prePayment: (payload: unknown) => Promise<boolean | void>;
    };
    const maskedPayload = { paymentOption: { card: { ccCardNumber: "411111******1111" } } };

    await expect(checkoutConfig.prePayment(maskedPayload)).resolves.toBe(false);
    expect(onPayButtonClick).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(validationError, { paymentReference: "payment-ref-123" });
  });

  it("confirms with the processor session token and never forwards browser result tokens", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onComplete = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions({ onComplete })).build({});
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      onResult: (result: { transactionStatus?: string; sessionToken?: string }) => void;
    };
    checkoutConfig.onResult({ transactionStatus: "APPROVED", sessionToken: "browser-result-token" });

    expect(mockConfirmPaymentResult).toHaveBeenCalledWith(
      "payment-ref-123",
      "known-session-token",
      expect.any(Object),
      onComplete,
      undefined,
      undefined,
    );
  });

  it("reports cancelled results as unsuccessful completion", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onComplete = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions({ onComplete })).build({});
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      onResult: (result: { cancelled: boolean }) => void;
    };
    checkoutConfig.onResult({ cancelled: true });

    expect(onComplete).toHaveBeenCalledWith({ isSuccess: false, paymentReference: "payment-ref-123" });
    expect(mockConfirmPaymentResult).not.toHaveBeenCalled();
  });

  it("forwards a generic safe error when the widget reports an error", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onError = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions({ onError })).build({});
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      onError: (error: unknown) => void;
    };
    checkoutConfig.onError({ name: "NuveiWidgetError", code: "E_WIDGET_1", message: "raw Nuvei detail" });

    expect(onError).toHaveBeenCalledWith(expect.any(Error), { paymentReference: "payment-ref-123" });
    const safeError = onError.mock.calls[0][0] as Error;
    expect(safeError.message).toBe("Nuvei Simply Connect reported an error.");
    expect(safeError.cause).toEqual({ name: "NuveiWidgetError", code: "E_WIDGET_1" });
  });

  it("submit rejects because Simply Connect handles submission internally", async () => {
    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions()).build({});

    await expect(dropin.submit()).rejects.toThrow(
      "Simply Connect handles submission internally via the widget pay button.",
    );
  });

  it("mount calls onError when initialization fails", async () => {
    stubDocument();
    const error = new Error("SDK unavailable");
    const onError = vi.fn();
    mockLoadSimplyConnectSdk.mockRejectedValue(error);

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions({ onError })).build({});

    await expect(dropin.mount("#payment-container")).rejects.toThrow(error);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("mount rejects when the target container is missing", async () => {
    vi.stubGlobal("document", { querySelector: vi.fn().mockReturnValue(null) });
    mockLoadSimplyConnectSdk.mockResolvedValue(vi.fn());
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions()).build({});

    await expect(dropin.mount("#missing")).rejects.toThrow("Mount target not found: #missing");
    expect(mockCreatePayment).not.toHaveBeenCalled();
    expect(mockLoadSimplyConnectSdk).not.toHaveBeenCalled();
  });

  it("isAvailable reflects SDK loading result", async () => {
    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions()).build({});

    mockLoadSimplyConnectSdk.mockResolvedValueOnce(vi.fn());
    await expect(dropin.isAvailable?.()).resolves.toBe(true);

    mockLoadSimplyConnectSdk.mockRejectedValueOnce(new Error("SDK load failed"));
    await expect(dropin.isAvailable?.()).resolves.toBe(false);
  });

  it("forwards only safe Simply Connect payment event stage names", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onPaymentEvent = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions()).build({ onPaymentEvent });
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      onPaymentEvent: (event: unknown) => void;
    };
    // Verified checkout.js contract: the stage lives on `eventType`. The widget
    // payload may also carry sensitive card data, which must not be forwarded.
    checkoutConfig.onPaymentEvent({ eventType: "challengeStarted", cardNumber: "4111111111111111" });
    checkoutConfig.onPaymentEvent({ eventType: "rawPayload", sessionToken: "secret" });
    checkoutConfig.onPaymentEvent({ eventType: "redirectionEnded", threeD: { version: "2.2.0" } });

    expect(onPaymentEvent).toHaveBeenCalledTimes(2);
    expect(onPaymentEvent).toHaveBeenCalledWith({ stage: "challengeStarted" });
    expect(onPaymentEvent).toHaveBeenCalledWith({ stage: "redirectionEnded" });
  });
});
