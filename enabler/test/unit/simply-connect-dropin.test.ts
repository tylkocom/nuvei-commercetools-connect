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
        merchant_unique_id: "payment-ref-123",
        merchantUniqueId: "payment-ref-123",
        merchantUniqueID: "payment-ref-123",
        env: "int",
        merchantId: "merchant-123",
        merchantSiteId: "site-456",
        amount: "10.00",
        currency: "USD",
        country: "DE",
        renderTo: "#payment-container",
        pmWhitelist: ["cc_card"],
        prePayment: expect.any(Function),
        onResult: expect.any(Function),
        onError: expect.any(Function),
        onPending: expect.any(Function),
        onPaymentEvent: expect.any(Function),
      }),
    );
    expect(onDropinReady).toHaveBeenCalledOnce();
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
    expect(onDropinReady).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(readyError, { paymentReference: "payment-ref-123" });
    await expect(dropin.mount("#payment-container")).resolves.toBeUndefined();
    expect(mockCreatePayment).toHaveBeenCalledOnce();
  });

  it("prePayment resolves after Checkout pre-submit gating succeeds", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onPayButtonClick = vi.fn().mockResolvedValue({ storePaymentDetails: true });
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions()).build({ onPayButtonClick });
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      prePayment: (controls: { resolve: () => void; reject: (reason?: string) => void }) => void;
    };
    const resolve = vi.fn();
    const reject = vi.fn();
    checkoutConfig.prePayment({ resolve, reject });

    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    expect(onPayButtonClick).toHaveBeenCalledOnce();
    expect(reject).not.toHaveBeenCalled();
  });

  it("prePayment supports positional resolve and reject callbacks", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onPayButtonClick = vi.fn().mockResolvedValue(undefined);
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions()).build({ onPayButtonClick });
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      prePayment: (resolve: () => void, reject: (reason?: string) => void) => void;
    };
    const resolve = vi.fn();
    const reject = vi.fn();
    checkoutConfig.prePayment(resolve, reject);

    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    expect(reject).not.toHaveBeenCalled();
  });

  it("prePayment reports invalid callback controls safely", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onError = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions({ onError })).build({});
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      prePayment: (controls: unknown) => void;
    };
    const reject = vi.fn();
    checkoutConfig.prePayment({ reject });

    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      paymentReference: "payment-ref-123",
    });
    expect((onError.mock.calls[0][0] as Error).message).toBe(
      "Nuvei prePayment controls were invalid.",
    );
    expect(reject).toHaveBeenCalledWith("Payment could not be started.");
  });

  it("prePayment throws a safe error when invalid controls include no reject path", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onError = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockPaymentSession();

    const dropin = new SimplyConnectDropinBuilder(makeEnablerOptions({ onError })).build({});
    await dropin.mount("#payment-container");

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      prePayment: (controls: unknown) => void;
    };

    expect(() => checkoutConfig.prePayment("garbage")).toThrow(
      "Nuvei prePayment controls were invalid.",
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      paymentReference: "payment-ref-123",
    });
  });

  it("prePayment rejects with a generic safe message when gating fails", async () => {
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
      prePayment: (controls: { resolve: () => void; reject: (reason?: string) => void }) => void;
    };
    const resolve = vi.fn();
    const reject = vi.fn();
    checkoutConfig.prePayment({ resolve, reject });

    await vi.waitFor(() => expect(reject).toHaveBeenCalledWith("Payment could not be started."));
    expect(resolve).not.toHaveBeenCalled();
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
      onResult: (result: { transactionStatus: string; sessionToken?: string }) => void;
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
    checkoutConfig.onPaymentEvent({ stage: "challengeStarted", cardNumber: "4111111111111111" });
    checkoutConfig.onPaymentEvent({ stage: "rawPayload", sessionToken: "secret" });

    expect(onPaymentEvent).toHaveBeenCalledOnce();
    expect(onPaymentEvent).toHaveBeenCalledWith({ stage: "challengeStarted" });
  });
});
