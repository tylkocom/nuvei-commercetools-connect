import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";

const mockLoadNuveiSdk = vi.hoisted(() => vi.fn());
const mockCreatePayment = vi.hoisted(() => vi.fn());
const mockConfirmPaymentResult = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/nuvei-sdk", () => ({
  loadNuveiSdk: mockLoadNuveiSdk,
}));

vi.mock("../../src/services/api-service", () => ({
  apiService: vi.fn(() => ({
    createPayment: mockCreatePayment,
  })),
  confirmPaymentResult: mockConfirmPaymentResult,
}));

import { DropinEmbeddedBuilder } from "../../src/dropin/dropin-embedded";

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

describe("DropinEmbeddedBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("build() returns a DropinComponent instance", () => {
    const builder = new DropinEmbeddedBuilder(makeEnablerOptions());
    const dropin = builder.build({ showPayButton: true });

    // The returned object must satisfy the DropinComponent interface
    expect(dropin).toBeDefined();
    expect(typeof dropin.mount).toBe("function");
    expect(typeof dropin.submit).toBe("function");
  });

  it("dropinHasSubmit is false", () => {
    const builder = new DropinEmbeddedBuilder(makeEnablerOptions());
    expect(builder.dropinHasSubmit).toBe(false);
  });

  it("submit() throws because Simply Connect handles submission internally", () => {
    const builder = new DropinEmbeddedBuilder(makeEnablerOptions());
    const dropin = builder.build({ showPayButton: true });

    expect(() => dropin.submit()).toThrow(
      "Simply Connect handles submission internally via the widget pay button.",
    );
  });

  it("passes correct config to checkout()", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    mockLoadNuveiSdk.mockResolvedValue(mockCheckout);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "st-123",
      paymentReference: "payment-ref-123",
      amount: "10.00",
      currency: "USD",
    });

    const builder = new DropinEmbeddedBuilder(makeEnablerOptions());
    const dropin = builder.build({ showPayButton: true });

    dropin.mount("#container");

    expect(mockCreatePayment).toHaveBeenCalledWith({
      paymentMethodOptions: { embedded: {} },
    });
    await vi.waitFor(() =>
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionToken: "st-123",
          env: "int",
          merchantId: "merchant-123",
          merchantSiteId: "site-456",
          amount: "10.00",
          currency: "USD",
          renderTo: "#container",
        }),
      ),
    );
  });

  // -------------------------------------------------------------------------
  // Session-token handoff (D-11)
  // -------------------------------------------------------------------------

  it("passes paymentRes.sessionToken (not result.sessionToken) as knownSessionToken to confirmPaymentResult (D-11)", async () => {
    stubDocument();
    // The Nuvei widget result carries a DIFFERENT sessionToken than the one
    // returned by createPayment. confirmPaymentResult must receive the
    // known processor session token, not the browser-returned one.
    const mockCheckout = vi.fn().mockImplementation((config) => {
      config.onResult({ transactionStatus: "APPROVED", sessionToken: "browser-session-token" });
    });
    mockLoadNuveiSdk.mockResolvedValue(mockCheckout);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "known-session-token",
      paymentReference: "payment-ref-123",
      amount: "10.00",
      currency: "USD",
    });

    const builder = new DropinEmbeddedBuilder(makeEnablerOptions());
    const dropin = builder.build({ showPayButton: true });
    dropin.mount("#container");

    await vi.waitFor(() => expect(mockConfirmPaymentResult).toHaveBeenCalled());

    // Third argument must be the known session token from createPayment,
    // NOT "browser-session-token" from the Nuvei widget result.
    expect(mockConfirmPaymentResult).toHaveBeenCalledWith(
      expect.objectContaining({ sessionToken: "browser-session-token" }), // result
      "payment-ref-123", // paymentReference
      "known-session-token", // knownSessionToken — from paymentRes, not result
      expect.any(Object), // api
      undefined, // onComplete (not set in makeEnablerOptions)
      undefined, // onError (not set in makeEnablerOptions)
      undefined, // onPending (not set in makeEnablerOptions)
    );
  });
});
