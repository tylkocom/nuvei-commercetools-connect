import { describe, expect, it } from "vitest";
import { NuveiEnabler } from "../../src/index";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";
import {
  PaymentMethod,
  SUPPORTED_PAYMENT_METHODS,
  validateEnablerOptions,
} from "../../src/payment-enabler/payment-enabler";

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

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe("validateEnablerOptions", () => {
  it("does not throw for valid options", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions())).not.toThrow();
  });

  // processorUrl
  it("throws when processorUrl is empty", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions({ processorUrl: "" }))).toThrow(
      'Invalid EnablerOptions: "processorUrl" is required',
    );
  });

  it("throws when processorUrl is not a string", () => {
    expect(() =>
      validateEnablerOptions(makeEnablerOptions({ processorUrl: undefined as any })),
    ).toThrow('Invalid EnablerOptions: "processorUrl" is required');
  });

  it("throws when processorUrl is not a valid URL", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions({ processorUrl: "not-a-url" }))).toThrow(
      'Invalid EnablerOptions: "processorUrl" is not a valid URL',
    );
  });

  // sessionId
  it("throws when sessionId is empty", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions({ sessionId: "" }))).toThrow(
      'Invalid EnablerOptions: "sessionId" is required',
    );
  });

  // merchantId
  it("throws when merchantId is empty", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions({ merchantId: "" }))).toThrow(
      'Invalid EnablerOptions: "merchantId" is required',
    );
  });

  // merchantSiteId
  it("throws when merchantSiteId is empty", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions({ merchantSiteId: "" }))).toThrow(
      'Invalid EnablerOptions: "merchantSiteId" is required',
    );
  });

  // env
  it("throws when env is neither test nor production", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions({ env: "staging" as any }))).toThrow(
      'Invalid EnablerOptions: "env" must be "test" or "production"',
    );
  });

  it("accepts env = production", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions({ env: "production" }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PaymentMethod & registry tests
// ---------------------------------------------------------------------------

describe("PaymentMethod enum", () => {
  it("contains card and dropin", () => {
    expect(PaymentMethod.card).toBe("card");
    expect(PaymentMethod.dropin).toBe("dropin");
  });

  it("SUPPORTED_PAYMENT_METHODS matches enum values", () => {
    expect(SUPPORTED_PAYMENT_METHODS).toEqual(["card", "dropin"]);
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

  it("rejects unsupported component types", async () => {
    const enabler = new NuveiEnabler(makeEnablerOptions());

    await expect(enabler.createComponentBuilder("paypal")).rejects.toThrow(
      'Component type "paypal" is not supported.',
    );
  });

  it("throws on construction with invalid options", () => {
    expect(() => new NuveiEnabler(makeEnablerOptions({ sessionId: "" }))).toThrow(
      'Invalid EnablerOptions: "sessionId" is required',
    );
  });

  it("throws on construction with invalid processorUrl", () => {
    expect(() => new NuveiEnabler(makeEnablerOptions({ processorUrl: "bad" }))).toThrow(
      'Invalid EnablerOptions: "processorUrl" is not a valid URL',
    );
  });
});
