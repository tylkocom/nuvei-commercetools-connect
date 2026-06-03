import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";
import * as scSdk from "../../src/services/simply-connect-sdk";

const mockCreatePayment = vi.hoisted(() => vi.fn());
const mockConfirmPaymentResult = vi.hoisted(() => vi.fn());
const mockLoadWebSdk = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/api-service", () => ({
  apiService: vi.fn(() => ({
    createPayment: mockCreatePayment,
    confirmPayment: vi.fn(),
    getPayment: vi.fn(),
  })),
  confirmPaymentResult: mockConfirmPaymentResult,
}));

vi.mock("../../src/services/web-sdk", () => ({
  loadWebSdk: mockLoadWebSdk,
}));

import { WebSdkCardBuilder } from "../../src/components/web-sdk-card";

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

function stubDocument() {
  vi.stubGlobal("document", {
    querySelector: vi.fn().mockReturnValue({ innerHTML: "" }),
  });
}

describe("WebSdkCardBuilder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("has componentHasSubmit = true", () => {
    const builder = new WebSdkCardBuilder(makeEnablerOptions());
    expect(builder.componentHasSubmit).toBe(true);
  });

  it("build() returns a component with mount, submit and isValid", async () => {
    const builder = new WebSdkCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    expect(typeof component.mount).toBe("function");
    expect(typeof component.submit).toBe("function");
    await expect(component.isValid()).resolves.toBe(false);
  });
});

describe("WebSdkCardComponent", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("submit() rejects before mount", async () => {
    const builder = new WebSdkCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    await expect(component.submit()).rejects.toThrow("WebSdkCardComponent: not mounted yet");
  });

  it("mount() creates a card field and submit() confirms using res.result", async () => {
    stubDocument();
    const attach = vi.fn();
    const cardField = { attach };
    const create = vi.fn().mockReturnValue(cardField);
    const fields = vi.fn().mockReturnValue({ create });
    const sfc = {
      fields,
      createPayment: vi.fn((_params, callback) => {
        callback({ result: "DECLINED", errCode: 42, transactionId: "tx-1" });
      }),
    };

    mockCreatePayment.mockResolvedValue({
      cartId: "cart-1",
      sessionToken: "session-token-1",
      paymentReference: "payment-ref-1",
      amount: "10.00",
      currency: "USD",
    });
    mockLoadWebSdk.mockResolvedValue(sfc);

    const builder = new WebSdkCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });
    await component.mount("#container");

    expect(mockLoadWebSdk).toHaveBeenCalled();
    expect(attach).toHaveBeenCalled();
    await expect(component.isValid()).resolves.toBe(true);

    await component.submit();

    await vi.waitFor(() => expect(mockConfirmPaymentResult).toHaveBeenCalled());

    expect(mockCreatePayment).toHaveBeenCalledWith({
      paymentMethodOptions: { card: {} },
    });
    expect(create).toHaveBeenCalledWith("card", {});
    expect(attach).toHaveBeenCalledWith(expect.any(Object));
    expect(sfc.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionToken: "session-token-1",
        clientUniqueId: "cart-1",
        paymentOption: cardField,
        billingAddress: {
          email: "sandbox@example.com",
          country: "US",
        },
      }),
      expect.any(Function),
    );
    expect(mockConfirmPaymentResult).toHaveBeenCalledWith(
      { transactionStatus: "DECLINED", errCode: 42 },
      "payment-ref-1",
      "session-token-1",
      expect.any(Object),
      undefined,
      undefined,
      undefined,
    );
  });

  it("does not import the Simply Connect loader path", async () => {
    stubDocument();
    const simplyConnectSpy = vi.spyOn(scSdk, "loadSimplyConnectSdk");
    mockCreatePayment.mockResolvedValue({
      cartId: "cart-1",
      sessionToken: "session-token-1",
      paymentReference: "payment-ref-1",
      amount: "10.00",
      currency: "USD",
    });
    mockLoadWebSdk.mockResolvedValue({
      fields: vi.fn().mockReturnValue({ create: vi.fn().mockReturnValue({ attach: vi.fn() }) }),
      createPayment: vi.fn(),
    });

    const builder = new WebSdkCardBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });
    await component.mount("#container");

    expect(mockLoadWebSdk).toHaveBeenCalled();
    expect(simplyConnectSpy).not.toHaveBeenCalled();
  });
});
