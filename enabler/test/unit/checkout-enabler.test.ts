import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetConfig = vi.hoisted(() => vi.fn());
const mockCreatePayment = vi.hoisted(() => vi.fn());
const mockConfirmPayment = vi.hoisted(() => vi.fn());
const mockLoadWebSdk = vi.hoisted(() => vi.fn());

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
    expect(mockGetConfig).toHaveBeenCalledOnce();
  });

  it("exposes template optional methods with unsupported/empty card-first behavior", async () => {
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
    await expect(enabler.createDropinBuilder("embedded")).rejects.toBeInstanceOf(
      PaymentSetupError,
    );
    await expect(enabler.createDropinBuilder("dropin")).rejects.toBeInstanceOf(
      PaymentSetupError,
    );
    await expect(enabler.createExpressBuilder("sample")).rejects.toBeInstanceOf(PaymentSetupError);
    await expect(enabler.createStoredPaymentMethodBuilder("card")).rejects.toBeInstanceOf(
      PaymentSetupError,
    );
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
});
