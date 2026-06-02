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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DropinEmbeddedBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("submit() throws for unsupported external submit", () => {
    const builder = new DropinEmbeddedBuilder(makeEnablerOptions());
    const dropin = builder.build({ showPayButton: true });

    expect(() => dropin.submit()).toThrow(
      "External submit is not supported by the Nuvei drop-in.",
    );
  });

  it("passes merchant_unique_id to Nuvei createPayment", async () => {
    const mockSfcCreatePayment = vi.fn();
    const mockSafeCharge = vi.fn().mockReturnValue({
      createPayment: mockSfcCreatePayment,
    });
    mockLoadNuveiSdk.mockResolvedValue(mockSafeCharge);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "st-123",
      paymentReference: "payment-ref-123",
    });

    const builder = new DropinEmbeddedBuilder(makeEnablerOptions());
    const dropin = builder.build({ showPayButton: true });

    dropin.mount("#container");

    expect(mockCreatePayment).toHaveBeenCalledWith({
      paymentMethodOptions: { embedded: {} },
    });
    await vi.waitFor(() =>
      expect(mockSfcCreatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionToken: "st-123",
          merchant_unique_id: "payment-ref-123",
        }),
      ),
    );
  });

  // -------------------------------------------------------------------------
  // Session-token handoff (D-11)
  // -------------------------------------------------------------------------

  it("passes paymentRes.sessionToken (not result.sessionToken) as knownSessionToken to confirmPaymentResult (D-11)", async () => {
    // The Nuvei widget result carries a DIFFERENT sessionToken than the one
    // returned by createPayment. confirmPaymentResult must receive the
    // known processor session token, not the browser-returned one.
    const mockSfcCreatePayment = vi.fn().mockImplementation(
      (opts: { onResult: (r: { transactionStatus: string; sessionToken: string }) => void }) => {
        opts.onResult({ transactionStatus: "APPROVED", sessionToken: "browser-session-token" });
      },
    );
    const mockSafeCharge = vi.fn().mockReturnValue({
      createPayment: mockSfcCreatePayment,
    });
    mockLoadNuveiSdk.mockResolvedValue(mockSafeCharge);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "known-session-token",
      paymentReference: "payment-ref-123",
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
