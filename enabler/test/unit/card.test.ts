import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";

// ---------------------------------------------------------------------------
// Hoisted mock functions – accessible both inside vi.mock factories and in tests
// ---------------------------------------------------------------------------

const mockLoadNuveiSdk = vi.hoisted(() => vi.fn());
const mockCreatePayment = vi.hoisted(() => vi.fn());
const mockGetPayment = vi.hoisted(() => vi.fn());
const mockConfirmPayment = vi.hoisted(() => vi.fn());
const mockConfirmPaymentResult = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/nuvei-sdk", () => ({
  loadNuveiSdk: mockLoadNuveiSdk,
}));

vi.mock("../../src/services/api-service", () => ({
  apiService: vi.fn(() => ({
    createPayment: mockCreatePayment,
    getPayment: mockGetPayment,
    confirmPayment: mockConfirmPayment,
  })),
  confirmPaymentResult: mockConfirmPaymentResult,
}));

import { CardComponentBuilder } from "../../src/components/card";

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
    querySelector: vi.fn().mockReturnValue({ innerHTML: "" }),
    createElement: vi.fn(),
    head: { appendChild: vi.fn() },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CardComponentBuilder", () => {
  it("creates a builder with componentHasSubmit = false", () => {
    const builder = new CardComponentBuilder(makeEnablerOptions());
    expect(builder.componentHasSubmit).toBe(false);
  });

  it("build() returns a PaymentComponent with mount and submit methods", () => {
    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    expect(component).toBeDefined();
    expect(typeof component.mount).toBe("function");
    expect(typeof component.submit).toBe("function");
  });
});

describe("CardComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // mount()
  // -------------------------------------------------------------------------
  it("mount() initiates payment creation and SDK loading", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    mockLoadNuveiSdk.mockResolvedValue(mockCheckout);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "st-123",
      paymentReference: "ref-123",
    });

    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    component.mount("#container");

    expect(mockLoadNuveiSdk).toHaveBeenCalled();
    expect(mockCreatePayment).toHaveBeenCalledWith({
      paymentMethodOptions: { card: {} },
    });
  });

  it("passes correct config to checkout()", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    mockLoadNuveiSdk.mockResolvedValue(mockCheckout);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "st-123",
      paymentReference: "payment-ref-123",
    });

    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    component.mount("#container");

    await vi.waitFor(() =>
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionToken: "st-123",
          env: "int",
          merchantId: "merchant-123",
          merchantSiteId: "site-456",
          renderTo: "#container",
        }),
      ),
    );
  });

  it("mount() calls onError when init fails", async () => {
    const error = new Error("SDK unavailable");
    mockLoadNuveiSdk.mockRejectedValue(error);

    const onError = vi.fn();
    const opts = { ...makeEnablerOptions(), onError };
    const builder = new CardComponentBuilder(opts);
    const component = builder.build({ showPayButton: true });

    component.mount("#container");

    // Wait for the rejected promise to propagate through .catch()
    const { promise: wait1, resolve: done1 } = Promise.withResolvers<void>();
    setTimeout(done1, 0);
    await wait1;

    expect(onError).toHaveBeenCalledWith(error);
  });

  // -------------------------------------------------------------------------
  // submit()
  // -------------------------------------------------------------------------
  it("submit() throws because Simply Connect handles submission internally", () => {
    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: false });

    expect(() => component.submit()).toThrow(
      "Simply Connect handles submission internally via the widget pay button.",
    );
  });

  it("submit() throws regardless of showPayButton setting", () => {
    const onPayButtonClick = vi.fn().mockResolvedValue(undefined);
    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true, onPayButtonClick });

    expect(() => component.submit()).toThrow(
      "Simply Connect handles submission internally via the widget pay button.",
    );
    expect(onPayButtonClick).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // isAvailable()
  // -------------------------------------------------------------------------
  it("isAvailable() returns true when SDK loads successfully", async () => {
    mockLoadNuveiSdk.mockResolvedValue(vi.fn());

    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    const available = await component.isAvailable();
    expect(available).toBe(true);
  });

  it("isAvailable() returns false when SDK fails to load", async () => {
    mockLoadNuveiSdk.mockRejectedValue(new Error("SDK load failed"));

    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    const available = await component.isAvailable();
    expect(available).toBe(false);
  });

  // -------------------------------------------------------------------------
  // isValid()
  // -------------------------------------------------------------------------
  it("isValid() returns false before mount", () => {
    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    expect(component.isValid()).toBe(false);
  });

  it("isValid() returns true after mount completes", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    mockLoadNuveiSdk.mockResolvedValue(mockCheckout);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "st-123",
      paymentReference: "ref-123",
    });

    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    component.mount("#container");

    // Wait for the async init to finish and set mounted = true
    await vi.waitFor(() => expect(component.isValid()).toBe(true));
  });

  // -------------------------------------------------------------------------
  // Session-token handoff (D-11, D-09)
  // -------------------------------------------------------------------------

  it("passes paymentRes.sessionToken (not result.sessionToken) as knownSessionToken to confirmPaymentResult (D-11)", async () => {
    stubDocument();
    // The Nuvei widget result has a DIFFERENT sessionToken than the one
    // from createPayment. confirmPaymentResult must be called with the
    // known processor session token, not the browser-returned one.
    const mockCheckout = vi.fn().mockImplementation((config) => {
      config.onResult({ transactionStatus: "APPROVED", sessionToken: "browser-session-token" });
    });
    mockLoadNuveiSdk.mockResolvedValue(mockCheckout);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "known-session-token",
      paymentReference: "payment-ref-123",
    });

    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });
    component.mount("#container");

    await vi.waitFor(() => expect(mockConfirmPaymentResult).toHaveBeenCalled());

    // Third argument must be the known session token from createPayment,
    // NOT "browser-session-token" from the Nuvei widget result.
    expect(mockConfirmPaymentResult).toHaveBeenCalledWith(
      expect.objectContaining({ sessionToken: "browser-session-token" }), // result (NuveiResult)
      "payment-ref-123", // paymentReference
      "known-session-token", // knownSessionToken — from paymentRes, not result
      expect.any(Object), // api
      undefined, // onComplete (not set in makeEnablerOptions)
      undefined, // onError (not set in makeEnablerOptions)
      undefined, // onPending (not set in makeEnablerOptions)
    );
  });
});
