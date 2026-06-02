import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";

const mockLoadNuveiSdk = vi.hoisted(() => vi.fn());
const mockCreatePayment = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/nuvei-sdk", () => ({
  loadNuveiSdk: mockLoadNuveiSdk,
}));

vi.mock("../../src/services/api-service", () => ({
  apiService: vi.fn(() => ({
    createPayment: mockCreatePayment,
  })),
  confirmPaymentResult: vi.fn(),
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

  it("dropinHasSubmit is true", () => {
    const builder = new DropinEmbeddedBuilder(makeEnablerOptions());
    expect(builder.dropinHasSubmit).toBe(true);
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
    await vi.waitFor(() =>
      expect(mockSfcCreatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionToken: "st-123",
          merchant_unique_id: "payment-ref-123",
        }),
      ),
    );
  });
});
