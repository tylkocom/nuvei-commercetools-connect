import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetConfig = vi.hoisted(() => vi.fn());
const mockCreatePayment = vi.hoisted(() => vi.fn());
const mockConfirmPayment = vi.hoisted(() => vi.fn());
const mockLoadWebSdk = vi.hoisted(() => vi.fn());
const mockLoadSimplyConnectSdk = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/api-service", () => ({
  apiService: vi.fn(() => ({
    getConfig: mockGetConfig,
    createPayment: mockCreatePayment,
    confirmPayment: mockConfirmPayment,
  })),
  confirmPaymentResult: vi.fn(),
}));

vi.mock("../../src/services/web-sdk", () => ({
  loadWebSdk: mockLoadWebSdk,
}));

vi.mock("../../src/services/simply-connect-sdk", () => ({
  loadSimplyConnectSdk: mockLoadSimplyConnectSdk,
}));

import { Enabler, PaymentSetupError } from "../../src/index";

function stubDocument() {
  vi.stubGlobal("document", {
    querySelector: vi.fn().mockReturnValue({ innerHTML: "" }),
  });
}

describe("Checkout-facing Enabler", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("accepts template-style constructor options without merchant config or mode", async () => {
    mockGetConfig.mockResolvedValue({
      environment: "test",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });

    const enabler = new Enabler({
      processorUrl: "https://processor.example.com",
      sessionId: "session-123",
    });

    const builder = await enabler.createComponentBuilder("card");

    expect(builder.componentHasSubmit).toBe(true);
    expect(mockGetConfig).not.toHaveBeenCalled();
  });

  it("exposes template optional methods with unsupported/empty behavior", async () => {
    mockGetConfig.mockResolvedValue({
      environment: "test",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });
    const enabler = new Enabler({
      processorUrl: "https://processor.example.com",
      sessionId: "session-123",
    });

    await expect(enabler.isStoredPaymentMethodsEnabled()).resolves.toBe(false);
    await expect(enabler.getStoredPaymentMethods()).resolves.toEqual({ storedPaymentMethods: [] });
    await expect(enabler.createDropinBuilder("embedded")).resolves.toMatchObject({
      dropinHasSubmit: false,
    });
    await expect(enabler.createDropinBuilder("hpp")).rejects.toBeInstanceOf(PaymentSetupError);
    await expect(enabler.createDropinBuilder("card")).rejects.toBeInstanceOf(PaymentSetupError);
    await expect(enabler.createDropinBuilder("dropin")).rejects.toBeInstanceOf(
      PaymentSetupError,
    );
    await expect(enabler.createExpressBuilder("sample")).rejects.toBeInstanceOf(PaymentSetupError);
    await expect(enabler.createStoredPaymentMethodBuilder("card")).rejects.toBeInstanceOf(
      PaymentSetupError,
    );
  });

  it("reports supported methods for the requested builder kind", async () => {
    const enabler = new Enabler({
      processorUrl: "https://processor.example.com",
      sessionId: "session-123",
    });

    await expect(enabler.createComponentBuilder("embedded")).rejects.toMatchObject({
      message: "Unsupported component payment method. Supported methods: card.",
    });
    await expect(enabler.createDropinBuilder("card")).rejects.toMatchObject({
      message: "Unsupported dropin payment method. Supported methods: embedded.",
    });
  });

  it("loads processor config before mounting the Web SDK card component", async () => {
    stubDocument();
    const attach = vi.fn();
    const cardField = { attach };
    const sfc = {
      fields: vi.fn().mockReturnValue({ create: vi.fn().mockReturnValue(cardField) }),
      createPayment: vi.fn(),
    };
    mockGetConfig.mockResolvedValue({
      environment: "production",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });
    mockCreatePayment.mockResolvedValue({
      cartId: "cart-1",
      sessionToken: "session-token-1",
      paymentReference: "payment-ref-1",
      amount: "10.00",
      currency: "USD",
    });
    mockLoadWebSdk.mockResolvedValue(sfc);

    const enabler = new Enabler({
      processorUrl: "https://processor.example.com",
      sessionId: "session-123",
      countryCode: "DE",
    });
    const builder = await enabler.createComponentBuilder("card");
    const component = builder.build({});

    await component.mount("#container");

    expect(mockLoadWebSdk).toHaveBeenCalledWith({
      env: "prod",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });
    expect(attach).toHaveBeenCalled();
  });

  it("loads processor config before mounting the Simply Connect drop-in", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    mockGetConfig.mockResolvedValue({
      environment: "test",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });
    mockCreatePayment.mockResolvedValue({
      cartId: "cart-1",
      sessionToken: "session-token-1",
      paymentReference: "payment-ref-1",
      amount: "10.00",
      currency: "USD",
    });
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);

    const enabler = new Enabler({
      processorUrl: "https://processor.example.com",
      sessionId: "session-123",
      countryCode: "PL",
    });
    const builder = await enabler.createDropinBuilder("embedded");
    const dropin = builder.build({});

    await dropin.mount("#container");

    expect(builder.dropinHasSubmit).toBe(false);
    expect(mockGetConfig).toHaveBeenCalledOnce();
    expect(mockCreatePayment).toHaveBeenCalledWith({ paymentMethodOptions: { embedded: {} } });
    expect(mockCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: "merchant-123",
        merchantSiteId: "site-456",
        env: "int",
        country: "PL",
        pmWhitelist: ["cc_card"],
      }),
    );
  });

  it("can retry drop-in mounting after a processor config failure", async () => {
    stubDocument();
    const mockCheckout = vi.fn();
    const configError = new Error("config unavailable");
    mockGetConfig
      .mockRejectedValueOnce(configError)
      .mockResolvedValueOnce({
        environment: "test",
        merchantId: "merchant-123",
        merchantSiteId: "site-456",
      });
    mockCreatePayment.mockResolvedValue({
      cartId: "cart-1",
      sessionToken: "session-token-1",
      paymentReference: "payment-ref-1",
      amount: "10.00",
      currency: "USD",
    });
    mockLoadSimplyConnectSdk.mockResolvedValue(mockCheckout);

    const enabler = new Enabler({
      processorUrl: "https://processor.example.com",
      sessionId: "session-123",
    });
    const builder = await enabler.createDropinBuilder("embedded");
    const dropin = builder.build({});

    await expect(dropin.mount("#container")).rejects.toThrow(configError);
    await expect(dropin.mount("#container")).resolves.toBeUndefined();

    expect(mockGetConfig).toHaveBeenCalledTimes(2);
    expect(mockCheckout).toHaveBeenCalledOnce();
  });

  it("reports unavailable instead of throwing when processor config cannot load", async () => {
    const configError = new Error("config unavailable");
    mockGetConfig.mockRejectedValueOnce(configError);

    const enabler = new Enabler({
      processorUrl: "https://processor.example.com",
      sessionId: "session-123",
    });
    const builder = await enabler.createDropinBuilder("embedded");
    const dropin = builder.build({});

    await expect(dropin.isAvailable()).resolves.toBe(false);
    expect(mockGetConfig).toHaveBeenCalledOnce();
  });
});
