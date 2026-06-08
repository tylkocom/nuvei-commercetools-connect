import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";

// ---------------------------------------------------------------------------
// Hoisted mock functions – accessible both inside vi.mock factories and in tests
// ---------------------------------------------------------------------------

const mockLoadSimplyConnectSdk = vi.hoisted(() => vi.fn());
const mockCreatePayment = vi.hoisted(() => vi.fn());
const mockGetPayment = vi.hoisted(() => vi.fn());
const mockConfirmPayment = vi.hoisted(() => vi.fn());
const mockConfirmPaymentResult = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/simply-connect-sdk", () => ({
  loadSimplyConnectSdk: mockLoadSimplyConnectSdk,
}));

vi.mock("../../src/services/api-service", () => ({
  apiService: vi.fn(() => ({
    createPayment: mockCreatePayment,
    getPayment: mockGetPayment,
    confirmPayment: mockConfirmPayment,
  })),
  confirmPaymentResult: mockConfirmPaymentResult,
}));

import { SimplyConnectCardBuilder } from "../../src/components/simply-connect-card";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnablerOptions(): EnablerOptions {
  return {
    processorUrl: "https://localhost:8080",
    sessionId: "session-123",
    merchantId: "merchant-123",
    merchantSiteId: "site-456",
    env: "test",
  };
}

function stubDocument() {
  vi.stubGlobal("document", {
    querySelector: vi
      .fn()
      .mockReturnValue({ innerHTML: "", querySelectorAll: vi.fn().mockReturnValue([]) }),
    createElement: vi.fn(),
    head: { appendChild: vi.fn() },
    querySelectorAll: vi.fn().mockReturnValue([]),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SimplyConnectCardBuilder", () => {
  it("creates a builder with componentHasSubmit = false", () => {
    const builder = new SimplyConnectCardBuilder(makeEnablerOptions());
    expect(builder.componentHasSubmit).toBe(false);
  });

  it("build() returns a PaymentComponent with mount and submit methods", () => {
    const builder = new SimplyConnectCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    expect(component).toBeDefined();
    expect(typeof component.mount).toBe("function");
    expect(typeof component.submit).toBe("function");
  });
});

describe("SimplyConnectCardComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("mount() initiates payment creation and SDK loading", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "st-123",
      paymentReference: "ref-123",
      amount: "10.00",
      currency: "USD",
    });

    const builder = new SimplyConnectCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    await component.mount("#container");

    expect(mockLoadSimplyConnectSdk).toHaveBeenCalled();
    expect(mockCreatePayment).toHaveBeenCalledWith({
      paymentMethodOptions: { card: {} },
    });
  });

  it("passes correct config and callback wiring to checkout()", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const onError = vi.fn();
    const onPending = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "st-123",
      paymentReference: "ref-123",
      amount: "10.00",
      currency: "USD",
    });

    const builder = new SimplyConnectCardBuilder({ ...makeEnablerOptions(), onError, onPending });
    const component = builder.build({ showPayButton: true });

    await component.mount("#container");

    await vi.waitFor(() =>
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionToken: "st-123",
          env: "int",
          merchantId: "merchant-123",
          merchantSiteId: "site-456",
          amount: "10.00",
          currency: "USD",
          merchant_unique_id: "ref-123",
          merchantUniqueId: "ref-123",
          merchantUniqueID: "ref-123",
          renderTo: "#container",
          onResult: expect.any(Function),
          onError: expect.any(Function),
          onPending: expect.any(Function),
        }),
      ),
    );

    const checkoutConfig = mockCheckout.mock.calls[0][0] as {
      onResult: (result: { transactionStatus: string }) => void;
      onError: (error: unknown) => void;
      onPending: () => void;
    };
    const sdkError = new Error("SDK error");
    checkoutConfig.onError(sdkError);
    checkoutConfig.onPending();
    checkoutConfig.onResult({ transactionStatus: "APPROVED" });

    expect(onError).toHaveBeenCalledWith(sdkError, { paymentReference: "ref-123" });
    expect(onPending).toHaveBeenCalledWith({ paymentReference: "ref-123" });
    expect(mockConfirmPaymentResult).toHaveBeenCalledWith(
      "ref-123",
      "st-123",
      expect.any(Object),
      undefined,
      onError,
      onPending,
    );
  });

  it("mount() calls onError when init fails", async () => {
    const error = new Error("SDK unavailable");
    mockLoadSimplyConnectSdk.mockRejectedValue(error);

    const onError = vi.fn();
    const opts = { ...makeEnablerOptions(), onError };
    const builder = new SimplyConnectCardBuilder(opts);
    const component = builder.build({ showPayButton: true });

    await expect(component.mount("#container")).rejects.toThrow(error);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it("submit() rejects because Simply Connect handles submission internally", async () => {
    const builder = new SimplyConnectCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: false });

    await expect(component.submit()).rejects.toThrow(
      "Simply Connect handles submission internally via the widget pay button.",
    );
  });

  it("submit() rejects regardless of showPayButton setting", async () => {
    const onPayButtonClick = vi.fn().mockResolvedValue(undefined);
    const builder = new SimplyConnectCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true, onPayButtonClick });

    await expect(component.submit()).rejects.toThrow(
      "Simply Connect handles submission internally via the widget pay button.",
    );
    expect(onPayButtonClick).not.toHaveBeenCalled();
  });

  it("isAvailable() returns true when SDK loads successfully", async () => {
    mockLoadSimplyConnectSdk.mockResolvedValue(vi.fn());

    const builder = new SimplyConnectCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    const available = await component.isAvailable();
    expect(available).toBe(true);
  });

  it("isAvailable() returns false when SDK fails to load", async () => {
    mockLoadSimplyConnectSdk.mockRejectedValue(new Error("SDK load failed"));

    const builder = new SimplyConnectCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    const available = await component.isAvailable();
    expect(available).toBe(false);
  });

  it("isValid() returns false before mount", async () => {
    const builder = new SimplyConnectCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    await expect(component.isValid()).resolves.toBe(false);
  });

  it("isValid() returns true after mount completes", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "st-123",
      paymentReference: "ref-123",
      amount: "10.00",
      currency: "USD",
    });

    const builder = new SimplyConnectCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    await component.mount("#container");

    await expect(component.isValid()).resolves.toBe(true);
  });

  it("passes paymentRes.sessionToken as knownSessionToken to confirmPaymentResult (D-11)", async () => {
    stubDocument();
    const mockCheckout = vi.fn().mockImplementation((config) => {
      config.onResult({ transactionStatus: "APPROVED", sessionToken: "browser-session-token" });
    });
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "known-session-token",
      paymentReference: "payment-ref-123",
      amount: "10.00",
      currency: "USD",
    });

    const builder = new SimplyConnectCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });
    await component.mount("#container");

    await vi.waitFor(() => expect(mockConfirmPaymentResult).toHaveBeenCalled());

    expect(mockConfirmPaymentResult).toHaveBeenCalledWith(
      "payment-ref-123",
      "known-session-token",
      expect.any(Object),
      undefined,
      undefined,
      undefined,
    );
  });
});
