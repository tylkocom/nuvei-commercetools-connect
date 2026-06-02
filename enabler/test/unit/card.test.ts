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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CardComponentBuilder", () => {
  it("creates a builder with componentHasSubmit = true", () => {
    const builder = new CardComponentBuilder(makeEnablerOptions());
    expect(builder.componentHasSubmit).toBe(true);
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
  });

  // -------------------------------------------------------------------------
  // mount()
  // -------------------------------------------------------------------------
  it("mount() initiates payment creation and SDK loading", async () => {
    const mockSfcCreatePayment = vi.fn();
    const mockSafeCharge = vi.fn().mockReturnValue({
      createPayment: mockSfcCreatePayment,
    });
    mockLoadNuveiSdk.mockResolvedValue(mockSafeCharge);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "st-123",
      paymentReference: "ref-123",
    });

    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    component.mount("#container");

    // loadNuveiSdk and createPayment are invoked synchronously before the
    // first await inside init(), so they are called immediately.
    expect(mockLoadNuveiSdk).toHaveBeenCalled();
    expect(mockCreatePayment).toHaveBeenCalledWith({
      paymentMethodOptions: { card: {} },
    });
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
    await new Promise((r) => setTimeout(r, 0));

    expect(onError).toHaveBeenCalledWith(error);
  });

  // -------------------------------------------------------------------------
  // submit()
  // -------------------------------------------------------------------------
  it("submit() throws when showPayButton is false", () => {
    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: false });

    expect(() => component.submit()).toThrow(
      "External submit is not supported. Use showPayButton: true.",
    );
  });

  it("submit() invokes onPayButtonClick when showPayButton is true", () => {
    const onPayButtonClick = vi.fn().mockResolvedValue(undefined);
    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true, onPayButtonClick });

    expect(() => component.submit()).not.toThrow();
    expect(onPayButtonClick).toHaveBeenCalled();
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
    const mockSafeCharge = vi.fn().mockReturnValue({ createPayment: vi.fn() });
    mockLoadNuveiSdk.mockResolvedValue(mockSafeCharge);
    mockCreatePayment.mockResolvedValue({
      sessionToken: "st-123",
      paymentReference: "ref-123",
    });

    const builder = new CardComponentBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    component.mount("#container");

    // Wait for the async init to finish and set mounted = true
    await new Promise((r) => setTimeout(r, 0));

    expect(component.isValid()).toBe(true);
  });
});
