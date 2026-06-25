import type {
  ComponentOptions,
  EnablerOptions,
  PaymentComponent,
  PaymentComponentBuilder,
  PaymentComponentState,
  SubmitOptions,
} from "../payment-enabler/payment-enabler.js";
import type { ApiService, PaymentSessionResponse } from "../services/api-service.js";
import { apiService, confirmPaymentResult } from "../services/api-service.js";
import {
  loadWebSdk,
  type SafeChargeApm,
  type SafeChargeGetApmsResult,
  type SafeChargeInstance,
  type SafeChargeResult,
} from "../services/web-sdk.js";

const BLIK_PAYMENT_METHOD = "apmgw_BLIK" as const;
const BLIK_CURRENCY = "PLN";
const BLIK_COUNTRY = "PL";

type BlikAvailability = {
  available: boolean;
  apm?: SafeChargeApm;
};

export class WebSdkBlikBuilder implements PaymentComponentBuilder {
  public componentHasSubmit = true;

  constructor(private readonly opts: EnablerOptions) {}

  build(config: ComponentOptions): PaymentComponent {
    return new WebSdkBlikComponent(this.opts, config);
  }
}

class WebSdkBlikComponent implements PaymentComponent {
  private readonly api: ApiService;
  private sfc: SafeChargeInstance | undefined;
  private sessionToken = "";
  private paymentReference = "";
  private cartId = "";
  private initPromise: Promise<void> | undefined;
  private codeInput: HTMLInputElement | undefined;
  private errorElement: HTMLElement | undefined;
  private statusElement: HTMLElement | undefined;
  private blikCode = "";
  private blikApm: SafeChargeApm | undefined;

  constructor(
    private readonly baseOptions: EnablerOptions,
    private readonly componentOptions: ComponentOptions,
  ) {
    this.api = apiService({
      baseApi: baseOptions.processorUrl,
      sessionId: baseOptions.sessionId,
    });
  }

  mount(selector: string): Promise<void> {
    this.initPromise ??= this.init(selector).catch((error: unknown) => {
      this.initPromise = undefined;
      this.baseOptions.onError?.(error);
      throw error;
    });
    return this.initPromise;
  }

  async submit(options: SubmitOptions = {}): Promise<void> {
    void options;
    if (!this.initPromise) {
      throw new Error("WebSdkBlikComponent: not mounted yet");
    }

    await this.initPromise;

    if (!this.sfc || !this.codeInput) {
      throw new Error("WebSdkBlikComponent: not mounted yet");
    }

    await this.componentOptions.onPayButtonClick?.();
    const blikCode = this.readCodeFromInput();
    if (blikCode.length !== 6) {
      await this.showValidation();
      throw new Error("Enter a 6-digit BLIK code.");
    }

    this.hideValidation();
    this.setStatus("Confirm the payment in your bank’s app.");

    try {
      this.sfc.createPayment(
        {
          sessionToken: this.sessionToken,
          clientUniqueId: this.cartId,
          merchant_unique_id: this.paymentReference,
          merchantUniqueId: this.paymentReference,
          merchantUniqueID: this.paymentReference,
          paymentOption: {
            alternativePaymentMethod: {
              paymentMethod: BLIK_PAYMENT_METHOD,
              blik_code: blikCode,
            },
          },
          ...(this.baseOptions.shopperEmail && {
            billingAddress: {
              email: this.baseOptions.shopperEmail,
              country: BLIK_COUNTRY,
            },
          }),
          savePM: false,
        },
        (res: SafeChargeResult) => {
          void this.handleWebSdkResult(res);
        },
      );
    } finally {
      this.clearCode();
    }
  }

  async isValid(): Promise<boolean> {
    return !!this.initPromise && this.blikCode.length === 6;
  }

  async getState(): Promise<PaymentComponentState> {
    return {};
  }

  async showValidation(): Promise<void> {
    if (!this.codeInput || !this.errorElement) return;
    this.codeInput.setAttribute("aria-invalid", "true");
    this.errorElement.hidden = false;
    this.codeInput.focus();
  }

  async isAvailable(): Promise<boolean> {
    try {
      const sfc = await this.getSafeChargeInstance();
      const availability = await this.lookupBlikApm(sfc);
      this.blikApm = availability.apm;
      return availability.available;
    } catch {
      return false;
    }
  }

  private async init(selector: string): Promise<void> {
    const container = document.querySelector(selector);
    if (!container) {
      throw new Error(`Mount target not found: ${selector}`);
    }

    const [paymentRes, sfc] = await Promise.all([
      this.api.createPayment({ paymentMethodOptions: { blik: {} } }),
      this.getSafeChargeInstance(),
    ]);

    this.validatePaymentSession(paymentRes);
    const availability = await this.lookupBlikApm(sfc);
    if (!availability.available) {
      throw new Error("BLIK is not available for PLN payments in Poland.");
    }

    this.blikApm = availability.apm;
    this.sessionToken = paymentRes.sessionToken;
    this.cartId = paymentRes.cartId;
    this.paymentReference = paymentRes.paymentReference;
    this.sfc = sfc;
    this.renderForm(container);
  }

  private getSafeChargeInstance(): Promise<SafeChargeInstance> {
    if (this.sfc) {
      return Promise.resolve(this.sfc);
    }

    return loadWebSdk({
      env: this.baseOptions.env === "production" ? "prod" : "int",
      merchantId: this.baseOptions.merchantId,
      merchantSiteId: this.baseOptions.merchantSiteId,
    }).then((sfc) => {
      this.sfc = sfc;
      return sfc;
    });
  }

  private validatePaymentSession(paymentRes: PaymentSessionResponse): void {
    if (paymentRes.uiMethod && paymentRes.uiMethod !== "blik") {
      throw new Error("Processor returned a non-BLIK UI method for BLIK component.");
    }
    if (paymentRes.paymentMethod !== "blik") {
      throw new Error("Processor returned a non-BLIK payment method for BLIK component.");
    }
    if (paymentRes.currency !== BLIK_CURRENCY) {
      throw new Error("BLIK requires PLN currency.");
    }
    if (paymentRes.countryCode && paymentRes.countryCode !== BLIK_COUNTRY) {
      throw new Error("BLIK requires PL country.");
    }
  }

  private lookupBlikApm(sfc: SafeChargeInstance): Promise<BlikAvailability> {
    if (!sfc.getApms) {
      return Promise.resolve({ available: true });
    }

    const params = {
      currencyCode: BLIK_CURRENCY,
      countryCode: BLIK_COUNTRY,
      ...(this.languageCode() && { languageCode: this.languageCode() }),
    };
    const promise = new Promise<SafeChargeGetApmsResult>((resolve) => {
      sfc.getApms?.(params, resolve);
    });

    return promise.then((res) => {
      if (!res.paymentMethods) {
        return { available: true };
      }
      const apm = res.paymentMethods.find((method) => method.paymentMethod === BLIK_PAYMENT_METHOD);
      return { available: !!apm, apm };
    });
  }

  private renderForm(container: Element): void {
    ensureBlikStyles();

    const root = document.createElement("div");
    root.className = "nuvei-blik";

    const label = document.createElement("label");
    label.className = "nuvei-blik__label";
    label.htmlFor = "nuvei-blik-code";
    label.textContent = "BLIK code";
    root.appendChild(label);

    const input = document.createElement("input");
    input.className = "nuvei-blik__input";
    input.id = "nuvei-blik-code";
    input.inputMode = "numeric";
    input.autocomplete = "one-time-code";
    input.pattern = "[0-9]*";
    input.maxLength = 7;
    input.placeholder = "123 456";
    input.setAttribute("aria-describedby", "nuvei-blik-help nuvei-blik-error");
    input.addEventListener("input", () => {
      this.readCodeFromInput();
      if (this.blikCode.length === 6) {
        this.hideValidation();
      }
    });
    root.appendChild(input);

    const help = document.createElement("p");
    help.className = "nuvei-blik__help";
    help.id = "nuvei-blik-help";
    help.textContent = "Enter the 6-digit BLIK code from your bank app.";
    root.appendChild(help);

    const error = document.createElement("p");
    error.className = "nuvei-blik__error";
    error.id = "nuvei-blik-error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    error.textContent = "Enter a 6-digit BLIK code.";
    root.appendChild(error);

    const status = document.createElement("p");
    status.className = "nuvei-blik__status";
    status.setAttribute("role", "status");
    status.hidden = true;
    root.appendChild(status);

    container.replaceChildren(root);
    this.codeInput = input;
    this.errorElement = error;
    this.statusElement = status;
    this.blikCode = "";
  }

  private readCodeFromInput(): string {
    if (!this.codeInput) return "";
    const digits = this.codeInput.value.replace(/\D/g, "").slice(0, 6);
    this.blikCode = digits;
    this.codeInput.value = formatBlikCode(digits);
    return digits;
  }

  private clearCode(): void {
    this.blikCode = "";
    if (this.codeInput) {
      this.codeInput.value = "";
      this.codeInput.setAttribute("aria-invalid", "false");
    }
  }

  private hideValidation(): void {
    if (this.codeInput) {
      this.codeInput.setAttribute("aria-invalid", "false");
    }
    if (this.errorElement) {
      this.errorElement.hidden = true;
    }
  }

  private setStatus(message: string): void {
    if (!this.statusElement) return;
    this.statusElement.textContent = message;
    this.statusElement.hidden = false;
  }

  private handleWebSdkResult(res: SafeChargeResult): void {
    if (res.cancelled) {
      this.baseOptions.onComplete?.({ isSuccess: false, paymentReference: this.paymentReference });
      return;
    }

    if (res.redirectUrl) {
      this.baseOptions.onError?.(new Error("Nuvei Web SDK returned a redirect for BLIK."), {
        paymentReference: this.paymentReference,
      });
      return;
    }

    if (res.result === "ERROR") {
      this.baseOptions.onError?.(new Error("Nuvei Web SDK returned ERROR."), {
        paymentReference: this.paymentReference,
      });
      return;
    }

    void confirmPaymentResult(
      this.paymentReference,
      this.sessionToken,
      this.api,
      this.baseOptions.onComplete,
      this.baseOptions.onError,
      this.baseOptions.onPending,
      { retryDelaysMs: [] },
    );
  }

  private languageCode(): string | undefined {
    const locale = this.baseOptions.locale?.trim();
    if (!locale) return undefined;
    const [language] = locale.split(/[-_]/);
    return language || undefined;
  }
}

function formatBlikCode(digits: string): string {
  return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

const BLIK_STYLE_ID = "nuvei-blik-styles";

const BLIK_STYLES = `
.nuvei-blik {
  --nuvei-blik-ink: #111827;
  --nuvei-blik-muted: #4b5563;
  --nuvei-blik-border: #cbd5e1;
  --nuvei-blik-focus: #475569;
  --nuvei-blik-error: #111827;
  --nuvei-blik-surface: #fff;
  --nuvei-blik-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 360px;
  box-sizing: border-box;
  font-family: inherit;
  color: var(--nuvei-blik-ink);
}
.nuvei-blik * {
  box-sizing: border-box;
}
.nuvei-blik__label {
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.3;
}
.nuvei-blik__input {
  width: 100%;
  margin: 0;
  font: inherit;
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.22em;
  color: inherit;
  padding: 12px 14px;
  border: 1px solid var(--nuvei-blik-border);
  border-radius: var(--nuvei-blik-radius);
  background: var(--nuvei-blik-surface);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.nuvei-blik__input::placeholder {
  color: var(--nuvei-blik-muted);
  font-weight: 400;
  letter-spacing: 0.22em;
  opacity: 0.55;
}
.nuvei-blik__input:hover {
  border-color: #94a3b8;
}
.nuvei-blik__input:focus,
.nuvei-blik__input:focus-visible {
  outline: none;
  border-color: var(--nuvei-blik-focus);
  box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.20);
}
.nuvei-blik__input[aria-invalid="true"] {
  border-color: var(--nuvei-blik-error);
  box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.15);
}
.nuvei-blik__help,
.nuvei-blik__error,
.nuvei-blik__status {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.4;
}
.nuvei-blik__help {
  color: var(--nuvei-blik-muted);
}
.nuvei-blik__error {
  color: var(--nuvei-blik-error);
  font-weight: 600;
}
.nuvei-blik__status {
  color: var(--nuvei-blik-muted);
}
@media (prefers-reduced-motion: reduce) {
  .nuvei-blik__input {
    transition: none;
  }
}
`;

function ensureBlikStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(BLIK_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = BLIK_STYLE_ID;
  style.textContent = BLIK_STYLES;
  document.head.appendChild(style);
}
