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

class FakeElement {
  public children: FakeElement[] = [];
  public attributes = new Map<string, string>();
  public classList = new Set<string>();
  public textContent = "";
  public className = "";
  public id = "";
  public hidden = false;
  public value = "";
  public type = "";
  public required = false;
  public maxLength = -1;

  constructor(public readonly tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = children;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function stubDocument() {
  const container = new FakeElement("div");
  const head = new FakeElement("head");
  const byId = new Map<string, FakeElement>();
  vi.stubGlobal("document", {
    querySelector: vi.fn().mockReturnValue(container),
    getElementById: vi.fn().mockImplementation((id: string) => byId.get(id) ?? null),
    createElement: vi.fn().mockImplementation((tagName: string) => new FakeElement(tagName)),
    head,
  });
  const originalAppend = head.appendChild.bind(head);
  head.appendChild = (child: FakeElement) => {
    if (child.id) byId.set(child.id, child);
    return originalAppend(child);
  };
  return { container };
}

function fillCardHolderName(container: FakeElement, value: string): void {
  const root = container.children[0];
  const input = root.children.find((child) => child.tagName === "input");
  if (!input) throw new Error("cardholder name input not rendered");
  input.value = value;
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
    const { container } = stubDocument();
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
    await expect(component.isValid()).resolves.toBe(false);
    fillCardHolderName(container, "  Jane Shopper  ");
    await expect(component.isValid()).resolves.toBe(true);

    await component.submit();

    await vi.waitFor(() => expect(mockConfirmPaymentResult).toHaveBeenCalled());

    expect(mockCreatePayment).toHaveBeenCalledWith({
      paymentMethodOptions: { card: {} },
    });
    expect(create).toHaveBeenCalledWith("card", { style: expect.any(Object) });
    expect(attach).toHaveBeenCalledWith(expect.any(Object));
    const createPaymentParams = sfc.createPayment.mock.calls[0][0];
    expect(createPaymentParams).toMatchObject({
      sessionToken: "session-token-1",
      clientUniqueId: "cart-1",
      merchant_unique_id: "payment-ref-1",
      merchantUniqueId: "payment-ref-1",
      merchantUniqueID: "payment-ref-1",
      paymentOption: cardField,
      cardHolderName: "Jane Shopper",
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

  it("blocks submission and shows an error when the cardholder name is empty", async () => {
    const { container } = stubDocument();
    const onPayButtonClick = vi.fn();
    const sfc = {
      fields: vi.fn().mockReturnValue({ create: vi.fn().mockReturnValue({ attach: vi.fn() }) }),
      createPayment: vi.fn(),
    };
    mockCreatePayment.mockResolvedValue({
      cartId: "cart-1",
      sessionToken: "session-token-1",
      paymentReference: "payment-ref-1",
      amount: "10.00",
      currency: "USD",
    });
    mockLoadWebSdk.mockResolvedValue(sfc);

    const component = new WebSdkCardBuilder(makeEnablerOptions()).build({
      showPayButton: true,
      onPayButtonClick,
    });
    await component.mount("#container");
    fillCardHolderName(container, "   ");

    await expect(component.submit()).rejects.toThrow("Enter the name shown on the card.");
    expect(sfc.createPayment).not.toHaveBeenCalled();
    expect(onPayButtonClick).not.toHaveBeenCalled();
    const error = container.children[0].children.find((c) => c.className === "nuvei-card__error");
    expect(error?.hidden).toBe(false);
  });

  it("renders Polish copy and error when the locale is pl-PL", async () => {
    const { container } = stubDocument();
    const sfc = {
      fields: vi.fn().mockReturnValue({ create: vi.fn().mockReturnValue({ attach: vi.fn() }) }),
      createPayment: vi.fn(),
    };
    mockCreatePayment.mockResolvedValue({
      cartId: "cart-1",
      sessionToken: "session-token-1",
      paymentReference: "payment-ref-1",
      amount: "10.00",
      currency: "PLN",
    });
    mockLoadWebSdk.mockResolvedValue(sfc);

    const component = new WebSdkCardBuilder(makeEnablerOptions({ locale: "pl-PL" })).build({
      showPayButton: true,
    });
    await component.mount("#container");

    const root = container.children[0];
    const labels = root.children.filter((c) => c.tagName === "label").map((c) => c.textContent);
    expect(labels).toEqual(["Imię i nazwisko na karcie", "Dane karty"]);

    fillCardHolderName(container, "  ");
    await expect(component.submit()).rejects.toThrow("Podaj imię i nazwisko widoczne na karcie.");
    expect(sfc.createPayment).not.toHaveBeenCalled();
  });

  it("attaches billingAddress when a shopper email is provided", async () => {
    const { container } = stubDocument();
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
    fillCardHolderName(container, "Jane Shopper");
    await component.submit();

    expect(sfc.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        billingAddress: { email: "shopper@example.com", country: "DE" },
      }),
      expect.any(Function),
    );
  });

  it("calls onError for Web SDK ERROR without confirmation polling", async () => {
    const { container } = stubDocument();
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
    fillCardHolderName(container, "Jane Shopper");
    await component.submit();

    expect(onError).toHaveBeenCalledWith(expect.any(Error), { paymentReference: "payment-ref-1" });
    expect((onError.mock.calls[0][0] as Error).message).toBe("Card validation failed");
    expect(mockConfirmPaymentResult).not.toHaveBeenCalled();
  });

  it("calls failed onComplete for Web SDK cancellation without confirmation polling", async () => {
    const { container } = stubDocument();
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
    fillCardHolderName(container, "Jane Shopper");
    await component.submit();

    expect(onComplete).toHaveBeenCalledWith({ isSuccess: false, paymentReference: "payment-ref-1" });
    expect(mockConfirmPaymentResult).not.toHaveBeenCalled();
  });

  it("routes declined Web SDK results through confirmation failure callback", async () => {
    const { container } = stubDocument();
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
    fillCardHolderName(container, "Jane Shopper");
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
