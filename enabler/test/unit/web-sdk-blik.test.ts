import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";
import type { PaymentSessionResponse } from "../../src/services/api-service";

const mockCreatePayment = vi.hoisted(() => vi.fn());
const mockConfirmPaymentResult = vi.hoisted(() => vi.fn());
const mockLoadWebSdk = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/api-service", () => ({
  apiService: vi.fn(() => ({
    createPayment: mockCreatePayment,
  })),
  confirmPaymentResult: mockConfirmPaymentResult,
}));

vi.mock("../../src/services/web-sdk", () => ({
  loadWebSdk: mockLoadWebSdk,
}));

import { WebSdkBlikBuilder } from "../../src/components/web-sdk-blik";

class FakeElement {
  public children: FakeElement[] = [];
  public attributes = new Map<string, string>();
  public listeners = new Map<string, () => void>();
  public value = "";
  public hidden = false;
  public textContent = "";
  public className = "";
  public id = "";
  public inputMode = "";
  public autocomplete = "";
  public pattern = "";
  public maxLength = 0;
  public htmlFor = "";
  public src = "";
  public alt = "";
  public focus = vi.fn();

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

  getAttribute(name: string): string | undefined {
    return this.attributes.get(name);
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  dispatchInput(): void {
    this.listeners.get("input")?.();
  }

  findByTag(tagName: string): FakeElement | undefined {
    if (this.tagName === tagName) return this;
    for (const child of this.children) {
      const found = child.findByTag(tagName);
      if (found) return found;
    }
    return undefined;
  }

  findByRole(role: string): FakeElement | undefined {
    if (this.attributes.get("role") === role) return this;
    for (const child of this.children) {
      const found = child.findByRole(role);
      if (found) return found;
    }
    return undefined;
  }
}

function makeEnablerOptions(overrides: Partial<EnablerOptions> = {}): EnablerOptions {
  return {
    processorUrl: "https://localhost:8080",
    sessionId: "session-123",
    merchantId: "merchant-123",
    merchantSiteId: "site-456",
    env: "test",
    locale: "pl-PL",
    ...overrides,
  };
}

function makeBlikSession(overrides: Partial<PaymentSessionResponse> = {}): PaymentSessionResponse {
  return {
    cartId: "cart-1",
    sessionToken: "session-token-1",
    paymentReference: "payment-ref-1",
    amount: "10.00",
    currency: "PLN",
    uiMethod: "blik",
    paymentMethod: "blik",
    integrationSurface: "web-sdk",
    countryCode: "PL",
    ...overrides,
  };
}

function stubDocument(): { mountTarget: FakeElement } {
  const mountTarget = new FakeElement("div");
  vi.stubGlobal("document", {
    querySelector: vi.fn().mockImplementation((selector: string) =>
      selector === "#container" ? mountTarget : null,
    ),
    createElement: vi.fn().mockImplementation((tagName: string) => new FakeElement(tagName)),
  });
  return { mountTarget };
}

function makeSfc(overrides: Record<string, unknown> = {}) {
  return {
    createPayment: vi.fn(),
    getApms: vi.fn((_params, callback) => {
      callback({
        paymentMethods: [
          {
            paymentMethod: "apmgw_BLIK",
            logoURL: "https://cdn.example.test/blik.svg",
          },
        ],
      });
    }),
    ...overrides,
  };
}

describe("WebSdkBlikBuilder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("has componentHasSubmit = true", () => {
    const builder = new WebSdkBlikBuilder(makeEnablerOptions());

    expect(builder.componentHasSubmit).toBe(true);
  });

  it("build() returns a component with safe initial state", async () => {
    const builder = new WebSdkBlikBuilder(makeEnablerOptions());
    const component = builder.build({ showPayButton: true });

    expect(typeof component.mount).toBe("function");
    expect(typeof component.submit).toBe("function");
    await expect(component.getState()).resolves.toEqual({});
    await expect(component.isValid()).resolves.toBe(false);
  });
});

describe("WebSdkBlikComponent", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("submit() rejects before mount", async () => {
    const component = new WebSdkBlikBuilder(makeEnablerOptions()).build({});

    await expect(component.submit()).rejects.toThrow("WebSdkBlikComponent: not mounted yet");
  });

  it("mount() requests a BLIK session, parses getApms, and renders numeric input", async () => {
    const { mountTarget } = stubDocument();
    const sfc = makeSfc();
    mockCreatePayment.mockResolvedValue(makeBlikSession());
    mockLoadWebSdk.mockResolvedValue(sfc);

    const component = new WebSdkBlikBuilder(makeEnablerOptions()).build({});
    await component.mount("#container");

    expect(mockCreatePayment).toHaveBeenCalledWith({ paymentMethodOptions: { blik: {} } });
    expect(mockLoadWebSdk).toHaveBeenCalledWith({
      env: "int",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });
    expect(sfc.getApms).toHaveBeenCalledWith(
      { currencyCode: "PLN", countryCode: "PL", languageCode: "pl" },
      expect.any(Function),
    );

    const input = mountTarget.findByTag("input");
    const img = mountTarget.findByTag("img");
    expect(input).toMatchObject({
      id: "nuvei-blik-code",
      inputMode: "numeric",
      autocomplete: "one-time-code",
      pattern: "[0-9]*",
      maxLength: 7,
    });
    expect(img).toMatchObject({ alt: "BLIK", src: "https://cdn.example.test/blik.svg" });
  });

  it("accepts missing getApms support but rejects getApms responses without BLIK", async () => {
    stubDocument();
    mockCreatePayment.mockResolvedValue(makeBlikSession());
    mockLoadWebSdk.mockResolvedValueOnce(makeSfc({ getApms: undefined }));

    const componentWithoutGetApms = new WebSdkBlikBuilder(makeEnablerOptions()).build({});
    await expect(componentWithoutGetApms.mount("#container")).resolves.toBeUndefined();

    vi.clearAllMocks();
    stubDocument();
    mockCreatePayment.mockResolvedValue(makeBlikSession());
    mockLoadWebSdk.mockResolvedValue(
      makeSfc({
        getApms: vi.fn((_params, callback) => callback({ paymentMethods: [] })),
      }),
    );

    const componentWithoutBlikApm = new WebSdkBlikBuilder(makeEnablerOptions()).build({});
    await expect(componentWithoutBlikApm.mount("#container")).rejects.toThrow(
      "BLIK is not available for PLN payments in Poland.",
    );
  });

  it("formats and validates BLIK input without exposing code through state", async () => {
    const { mountTarget } = stubDocument();
    const sfc = makeSfc();
    mockCreatePayment.mockResolvedValue(makeBlikSession());
    mockLoadWebSdk.mockResolvedValue(sfc);
    const component = new WebSdkBlikBuilder(makeEnablerOptions()).build({});
    await component.mount("#container");

    const input = mountTarget.findByTag("input");
    if (!input) throw new Error("input missing");

    input.value = "12a3 4567";
    input.dispatchInput();

    expect(input.value).toBe("123 456");
    await expect(component.isValid()).resolves.toBe(true);
    await expect(component.getState()).resolves.toEqual({});

    input.value = "12";
    input.dispatchInput();
    await expect(component.isValid()).resolves.toBe(false);
    await expect(component.submit()).rejects.toThrow("Enter a 6-digit BLIK code.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.focus).toHaveBeenCalledOnce();
    expect(sfc.createPayment).not.toHaveBeenCalled();
  });

  it("submits exact BLIK APM payload to Nuvei and clears the one-time code", async () => {
    const { mountTarget } = stubDocument();
    const sfc = makeSfc();
    mockCreatePayment.mockResolvedValue(makeBlikSession());
    mockLoadWebSdk.mockResolvedValue(sfc);
    const onPayButtonClick = vi.fn();
    const component = new WebSdkBlikBuilder(makeEnablerOptions()).build({ onPayButtonClick });
    await component.mount("#container");

    const input = mountTarget.findByTag("input");
    if (!input) throw new Error("input missing");
    input.value = "777777";
    input.dispatchInput();

    await component.submit({ storePaymentDetails: true });

    expect(onPayButtonClick).toHaveBeenCalledOnce();
    expect(sfc.createPayment).toHaveBeenCalledWith(
      {
        sessionToken: "session-token-1",
        clientUniqueId: "cart-1",
        merchant_unique_id: "payment-ref-1",
        merchantUniqueId: "payment-ref-1",
        merchantUniqueID: "payment-ref-1",
        paymentOption: {
          alternativePaymentMethod: {
            paymentMethod: "apmgw_BLIK",
            blik_code: "777777",
          },
        },
        savePM: false,
      },
      expect.any(Function),
    );
    expect(input.value).toBe("");
    await expect(component.getState()).resolves.toEqual({});
    expect(mockCreatePayment).toHaveBeenCalledWith({ paymentMethodOptions: { blik: {} } });
  });

  it("confirms pending BLIK results once without retry delays", async () => {
    const { mountTarget } = stubDocument();
    const sfc = makeSfc({
      createPayment: vi.fn((_params, callback) => callback({ result: "PENDING" })),
    });
    const onPending = vi.fn();
    mockCreatePayment.mockResolvedValue(makeBlikSession());
    mockLoadWebSdk.mockResolvedValue(sfc);
    const component = new WebSdkBlikBuilder(makeEnablerOptions({ onPending })).build({});
    await component.mount("#container");

    const input = mountTarget.findByTag("input");
    if (!input) throw new Error("input missing");
    input.value = "777777";
    input.dispatchInput();
    await component.submit();

    await vi.waitFor(() => expect(mockConfirmPaymentResult).toHaveBeenCalledOnce());
    expect(mockConfirmPaymentResult).toHaveBeenCalledWith(
      "payment-ref-1",
      "session-token-1",
      expect.any(Object),
      undefined,
      undefined,
      onPending,
      { retryDelaysMs: [] },
    );
  });

  it("handles cancellation and sanitized Web SDK errors without confirming", async () => {
    const { mountTarget } = stubDocument();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const sfc = makeSfc({
      createPayment: vi.fn((_params, callback) => callback({ result: "ERROR", cancelled: true })),
    });
    mockCreatePayment.mockResolvedValue(makeBlikSession());
    mockLoadWebSdk.mockResolvedValue(sfc);
    const component = new WebSdkBlikBuilder(makeEnablerOptions({ onComplete, onError })).build({});
    await component.mount("#container");

    const input = mountTarget.findByTag("input");
    if (!input) throw new Error("input missing");
    input.value = "777777";
    input.dispatchInput();
    await component.submit();

    expect(onComplete).toHaveBeenCalledWith({ isSuccess: false, paymentReference: "payment-ref-1" });
    expect(onError).not.toHaveBeenCalled();
    expect(mockConfirmPaymentResult).not.toHaveBeenCalled();

    vi.clearAllMocks();
    input.value = "777777";
    input.dispatchInput();
    sfc.createPayment.mockImplementationOnce((_params, callback) =>
      callback({ result: "ERROR", errorDescription: "raw gateway detail" }),
    );
    await component.submit();

    expect(onError).toHaveBeenCalledWith(expect.any(Error), { paymentReference: "payment-ref-1" });
    expect((onError.mock.calls[0][0] as Error).message).toBe("Nuvei Web SDK returned ERROR.");
    expect(mockConfirmPaymentResult).not.toHaveBeenCalled();
  });
});
