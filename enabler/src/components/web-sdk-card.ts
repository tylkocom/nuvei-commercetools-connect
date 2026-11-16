import type {
  ComponentOptions,
  EnablerOptions,
  PaymentComponent,
  PaymentComponentBuilder,
  PaymentComponentState,
  SubmitOptions,
} from "../payment-enabler/payment-enabler.js";
import type { ApiService } from "../services/api-service.js";
import { apiService, confirmPaymentResult } from "../services/api-service.js";
import {
  loadWebSdk,
  type SafeChargeCardField,
  type SafeChargeFieldStyle,
  type SafeChargeInstance,
  type SafeChargeResult,
} from "../services/web-sdk.js";

export class WebSdkCardBuilder implements PaymentComponentBuilder {
  public componentHasSubmit = true;

  constructor(private readonly opts: EnablerOptions) {}

  build(config: ComponentOptions): PaymentComponent {
    return new WebSdkCardComponent(this.opts, config);
  }
}

class WebSdkCardComponent implements PaymentComponent {
  private readonly api: ApiService;
  private sfc: SafeChargeInstance | undefined;
  private scard: SafeChargeCardField | undefined;
  private fieldShell: HTMLElement | undefined;
  private nameInput: HTMLInputElement | undefined;
  private errorElement: HTMLElement | undefined;
  private sessionToken = "";
  private paymentReference = "";
  private cartId = "";
  private initPromise: Promise<void> | undefined;

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
    if (!this.initPromise) {
      throw new Error("WebSdkCardComponent: not mounted yet");
    }

    await this.initPromise;

    if (!this.sfc || !this.scard) {
      throw new Error("WebSdkCardComponent: not mounted yet");
    }

    // Hosted Nuvei Fields collect only number/expiry/CVV; the cardholder name
    // must be sent explicitly so the managed 3DS flow carries it. Never log it.
    const cardHolderName = this.cardHolderName();
    if (!cardHolderName) {
      this.showError(CARDHOLDER_NAME_REQUIRED_MESSAGE);
      throw new Error(CARDHOLDER_NAME_REQUIRED_MESSAGE);
    }

    const clickOptions = await this.componentOptions.onPayButtonClick?.();
    const storePaymentDetails = clickOptions?.storePaymentDetails ?? options.storePaymentDetails;

    this.sfc.createPayment(
      {
        sessionToken: this.sessionToken,
        clientUniqueId: this.cartId,
        merchant_unique_id: this.paymentReference,
        merchantUniqueId: this.paymentReference,
        merchantUniqueID: this.paymentReference,
        cardHolderName,
        paymentOption: this.scard,
        // Only attach billingAddress when we actually hold shopper data: one
        // without an email trips the mandatory-field rules (gateway error 1136).
        // When the cart already supplies email + country, the processor sends
        // openOrder `preventOverride`, so this block cannot wipe the cart's
        // first/last name; otherwise it fills the missing email.
        ...(this.baseOptions.shopperEmail && {
          billingAddress: {
            email: this.baseOptions.shopperEmail,
            country: this.baseOptions.countryCode ?? "US",
          },
        }),
        ...(storePaymentDetails !== undefined && { savePM: storePaymentDetails }),
      },
      (res: SafeChargeResult) => {
        void this.handleWebSdkResult(res);
      },
    );
  }

  async isValid(): Promise<boolean> {
    return !!this.scard && !!this.cardHolderName();
  }

  private cardHolderName(): string {
    return (this.nameInput?.value ?? "").trim().slice(0, CARDHOLDER_NAME_MAX_LENGTH);
  }

  private showError(message: string): void {
    if (!this.errorElement) return;
    this.errorElement.textContent = message;
    this.errorElement.hidden = false;
  }

  async getState(): Promise<PaymentComponentState> {
    return {};
  }

  async showValidation(): Promise<void> {
    // Nuvei-hosted iframe validation is triggered during SDK submission.
  }

  async isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  private async init(selector: string): Promise<void> {
    const [paymentRes, sfc] = await Promise.all([
      this.api.createPayment({ paymentMethodOptions: { card: {} } }),
      loadWebSdk({
        env: this.baseOptions.env === "production" ? "prod" : "int",
        merchantId: this.baseOptions.merchantId,
        merchantSiteId: this.baseOptions.merchantSiteId,
      }),
    ]);

    this.sessionToken = paymentRes.sessionToken;
    this.cartId = paymentRes.cartId;
    this.paymentReference = paymentRes.paymentReference;
    this.sfc = sfc;

    const container = document.querySelector(selector);
    if (!container) {
      throw new Error(`Mount target not found: ${selector}`);
    }

    this.renderShell(container);

    const scFields = sfc.fields({});
    this.scard = scFields.create("card", { style: CARD_FIELD_STYLE });
    // Attach into the styled shell (already in the DOM) rather than the bare
    // mount target, so the hosted iframe sits inside a real input box.
    this.scard.attach(this.fieldShell as Element);
    this.wireFieldEvents();
  }

  private renderShell(container: Element): void {
    ensureCardStyles();

    const root = document.createElement("div");
    root.className = "nuvei-card";

    const nameLabel = document.createElement("label");
    nameLabel.className = "nuvei-card__label";
    nameLabel.setAttribute("for", CARDHOLDER_NAME_INPUT_ID);
    nameLabel.textContent = "Name on card";
    root.appendChild(nameLabel);

    const nameInput = document.createElement("input");
    nameInput.id = CARDHOLDER_NAME_INPUT_ID;
    nameInput.className = "nuvei-card__input";
    nameInput.type = "text";
    nameInput.required = true;
    nameInput.maxLength = CARDHOLDER_NAME_MAX_LENGTH;
    nameInput.setAttribute("autocomplete", "cc-name");
    nameInput.setAttribute("spellcheck", "false");
    root.appendChild(nameInput);

    const label = document.createElement("label");
    label.className = "nuvei-card__label";
    label.textContent = "Card details";
    root.appendChild(label);
    const fieldShell = document.createElement("div");
    fieldShell.className = "nuvei-card__field";
    root.appendChild(fieldShell);

    const help = document.createElement("p");
    help.className = "nuvei-card__help";
    help.textContent = "Card number, expiry, and security code.";
    root.appendChild(help);

    const error = document.createElement("p");
    error.className = "nuvei-card__error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    root.appendChild(error);

    container.replaceChildren(root);
    this.fieldShell = fieldShell;
    this.nameInput = nameInput;
    this.errorElement = error;
  }

  // Progressive enhancement: if the SDK build exposes the hosted-field event
  // channel, reflect focus and validation state on the shell. Feature-detected
  // so it is a no-op when unavailable; payloads must be verified in the Nuvei
  // sandbox before being treated as production-guaranteed.
  private wireFieldEvents(): void {
    if (!this.scard?.on || !this.fieldShell) return;
    const shell = this.fieldShell;

    this.scard.on("focus", () => shell.classList.add("is-focused"));
    this.scard.on("blur", () => shell.classList.remove("is-focused"));
    this.scard.on("change", (event) => {
      const message = event?.error?.message;
      if (message) {
        shell.classList.add("is-invalid");
        if (this.errorElement) {
          this.errorElement.textContent = message;
          this.errorElement.hidden = false;
        }
      } else {
        shell.classList.remove("is-invalid");
        if (this.errorElement) this.errorElement.hidden = true;
      }
    });
  }

  private handleWebSdkResult(res: SafeChargeResult): void {
    if (res.cancelled) {
      this.baseOptions.onComplete?.({ isSuccess: false, paymentReference: this.paymentReference });
      return;
    }

    if (res.result === "ERROR") {
      this.baseOptions.onError?.(
        new Error(res.errorDescription || "Nuvei Web SDK returned ERROR."),
        { paymentReference: this.paymentReference },
      );
      return;
    }

    void confirmPaymentResult(
      this.paymentReference,
      this.sessionToken,
      this.api,
      this.baseOptions.onComplete,
      this.baseOptions.onError,
      this.baseOptions.onPending,
    );
  }
}

// Styles the text *inside* the Nuvei-hosted iframe. The iframe is cross-origin,
// so it cannot inherit the host font; values are sent to the SDK explicitly.
const CARD_FIELD_STYLE: SafeChargeFieldStyle = {
  base: {
    fontSize: "16px",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontWeight: "500",
    color: "#111827",
    "::placeholder": { color: "#9ca3af" },
  },
  invalid: {
    color: "#111827",
  },
};

const CARD_STYLE_ID = "nuvei-card-styles";
const CARDHOLDER_NAME_INPUT_ID = "nuvei-card-holder-name";
// Nuvei cardHolderName limit.
const CARDHOLDER_NAME_MAX_LENGTH = 70;
const CARDHOLDER_NAME_REQUIRED_MESSAGE = "Enter the name shown on the card.";

const CARD_STYLES = `
.nuvei-card {
  --nuvei-card-ink: #111827;
  --nuvei-card-muted: #4b5563;
  --nuvei-card-border: #cbd5e1;
  --nuvei-card-focus: #475569;
  --nuvei-card-error: #111827;
  --nuvei-card-surface: #fff;
  --nuvei-card-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 420px;
  box-sizing: border-box;
  font-family: inherit;
  color: var(--nuvei-card-ink);
}
.nuvei-card * {
  box-sizing: border-box;
}
.nuvei-card__label {
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.3;
}
.nuvei-card__field {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid var(--nuvei-card-border);
  border-radius: var(--nuvei-card-radius);
  background: var(--nuvei-card-surface);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.nuvei-card__input {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid var(--nuvei-card-border);
  border-radius: var(--nuvei-card-radius);
  background: var(--nuvei-card-surface);
  color: inherit;
  font: inherit;
}
.nuvei-card__input:focus {
  outline: none;
  border-color: var(--nuvei-card-focus);
  box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.20);
}
.nuvei-card__field iframe {
  display: block;
  width: 100% !important;
}
.nuvei-card__field:hover {
  border-color: #94a3b8;
}
.nuvei-card__field.is-focused {
  border-color: var(--nuvei-card-focus);
  box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.20);
}
.nuvei-card__field.is-invalid {
  border-color: var(--nuvei-card-error);
  box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.15);
}
.nuvei-card__help,
.nuvei-card__error {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.4;
}
.nuvei-card__help {
  color: var(--nuvei-card-muted);
}
.nuvei-card__error {
  color: var(--nuvei-card-error);
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  .nuvei-card__field {
    transition: none;
  }
}
`;

function ensureCardStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(CARD_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CARD_STYLE_ID;
  style.textContent = CARD_STYLES;
  document.head.appendChild(style);
}
