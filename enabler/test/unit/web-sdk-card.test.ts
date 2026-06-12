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
    const createPaymentParams = sfc.createPayment.mock.calls[0][0];
    expect(createPaymentParams).toMatchObject({
      sessionToken: "session-token-1",
      clientUniqueId: "cart-1",
      merchant_unique_id: "payment-ref-1",
      merchantUniqueId: "payment-ref-1",
      merchantUniqueID: "payment-ref-1",
      paymentOption: cardField,
    });
    // Without a shopper email the payload must NOT carry a billingAddress: an
    // explicit one replaces the processor's openOrder pre-fill at the gateway
    // and trips the mandatory-field rules (gateway error 1136).
    expect(createPaymentParams).not.toHaveProperty("billingAddress");
    expect(sfc.createPayment).toHaveBeenCalledWith(expect.any(Object), expect.any(Function));
    expect(mockConfirmPaymentResult).toHaveBeenCalledWith(
      "payment-ref-1",
      "session-token-1",
      expect.any(Object),
      undefined,
      undefined,
      undefined,
    );
  });

  it("attaches billingAddress when a shopper email is provided", async () => {
    stubDocument();
    const attach = vi.fn();
    const create = vi.fn().mockReturnValue({ attach });
    const sfc = {
      fields: vi.fn().mockReturnValue({ create }),
      createPayment: vi.fn((_params: unknown, callback: (res: unknown) => void) => {
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

    const builder = new WebSdkCardBuilder(
      makeEnablerOptions({ shopperEmail: "shopper@example.com", countryCode: "DE" }),
    );
    const component = builder.build({ showPayButton: true });
    await component.mount("#container");
    await component.submit();

    expect(sfc.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        billingAddress: { email: "shopper@example.com", country: "DE" },
      }),
      expect.any(Function),
    );
  });

  it("calls onError for Web SDK ERROR without confirmation polling", async () => {
    stubDocument();
    const onError = vi.fn();
    const sfc = {
      fields: vi.fn().mockReturnValue({ create: vi.fn().mockReturnValue({ attach: vi.fn() }) }),
      createPayment: vi.fn((_params, callback) => {
        callback({ result: "ERROR", errorDescription: "Card validation failed" });
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

    const builder = new WebSdkCardBuilder(makeEnablerOptions({ onError }));
    const component = builder.build({ showPayButton: true });
    await component.mount("#container");
    await component.submit();

    expect(onError).toHaveBeenCalledWith(expect.any(Error), { paymentReference: "payment-ref-1" });
    expect((onError.mock.calls[0][0] as Error).message).toBe("Card validation failed");
    expect(mockConfirmPaymentResult).not.toHaveBeenCalled();
  });

  it("calls failed onComplete for Web SDK cancellation without confirmation polling", async () => {
    stubDocument();
    const onComplete = vi.fn();
    const sfc = {
      fields: vi.fn().mockReturnValue({ create: vi.fn().mockReturnValue({ attach: vi.fn() }) }),
      createPayment: vi.fn((_params, callback) => {
        callback({ result: "ERROR", cancelled: true });
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

    const builder = new WebSdkCardBuilder(makeEnablerOptions({ onComplete }));
    const component = builder.build({ showPayButton: true });
    await component.mount("#container");
    await component.submit();

    expect(onComplete).toHaveBeenCalledWith({ isSuccess: false, paymentReference: "payment-ref-1" });
    expect(mockConfirmPaymentResult).not.toHaveBeenCalled();
  });

  it("routes declined Web SDK results through confirmation failure callback", async () => {
    stubDocument();
    const onComplete = vi.fn();
    mockConfirmPaymentResult.mockImplementation((paymentReference, _sessionToken, _api, callback) => {
      callback?.({ isSuccess: false, paymentReference });
    });
    const sfc = {
      fields: vi.fn().mockReturnValue({ create: vi.fn().mockReturnValue({ attach: vi.fn() }) }),
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

    const builder = new WebSdkCardBuilder(makeEnablerOptions({ onComplete }));
    const component = builder.build({ showPayButton: true });
    await component.mount("#container");
    await component.submit();

    expect(mockConfirmPaymentResult).toHaveBeenCalledWith(
      "payment-ref-1",
      "session-token-1",
      expect.any(Object),
      onComplete,
      undefined,
      undefined,
    );
    expect(onComplete).toHaveBeenCalledWith({ isSuccess: false, paymentReference: "payment-ref-1" });
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
