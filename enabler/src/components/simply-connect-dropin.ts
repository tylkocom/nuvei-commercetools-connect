import type {
  DropinComponent,
  DropinOptions,
  EnablerOptions,
  PaymentComponentState,
  PaymentDropinBuilder,
  SafePaymentEventStage,
  SubmitOptions,
} from "../payment-enabler/payment-enabler.js";
import { PaymentMethod } from "../payment-enabler/payment-enabler.js";
import type { ApiService, PaymentSessionResponse } from "../services/api-service.js";
import { apiService, confirmPaymentResult } from "../services/api-service.js";
import type {
  CheckoutConfig,
  CheckoutResult,
  PrePaymentCallback,
  PrePaymentControls,
  SimplyConnectPaymentEvent,
} from "../services/simply-connect-sdk.js";
import { loadSimplyConnectSdk } from "../services/simply-connect-sdk.js";

// Card-only by design: non-card Simply Connect APMs stay hidden until each method has
// dedicated Nuvei setup, DMN mapping, operation support, fixtures, and runbook evidence.
const SIMPLY_CONNECT_CARD_WHITELIST = ["cc_card"] as const;
const PRE_PAYMENT_REJECTION_MESSAGE = "Payment could not be started.";
const SIMPLY_CONNECT_INTERNAL_SUBMIT_MESSAGE =
  "Simply Connect handles submission internally via the widget pay button.";
const SIMPLY_CONNECT_WIDGET_ERROR_MESSAGE = "Nuvei Simply Connect reported an error.";

type SimplyConnectCheckoutOverrides = Partial<
  Pick<CheckoutConfig, "pmWhitelist" | "prePayment" | "onPaymentEvent">
>;

type SafeWidgetErrorCause = {
  name?: string;
  code?: string | number;
};

const SAFE_PAYMENT_EVENT_STAGES: Record<SafePaymentEventStage, true> = {
  challengeStarted: true,
  challengeEnded: true,
  redirectionStarted: true,
  redirectionEnded: true,
};

export class SimplyConnectDropinBuilder implements PaymentDropinBuilder {
  public dropinHasSubmit = false;

  constructor(private readonly opts: EnablerOptions) {}

  build(config: DropinOptions): DropinComponent {
    return new SimplyConnectDropinComponent(this.opts, config);
  }
}

class SimplyConnectDropinComponent implements DropinComponent {
  private mounted = false;
  private readonly api: ApiService;
  private paymentReference = "";
  private sessionToken = "";
  private initPromise: Promise<void> | undefined;
  private container: Element | undefined;

  constructor(
    private readonly baseOptions: EnablerOptions,
    private readonly componentOptions: DropinOptions,
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

  async submit(_options: SubmitOptions = {}): Promise<void> {
    throw new Error(SIMPLY_CONNECT_INTERNAL_SUBMIT_MESSAGE);
  }

  async isValid(): Promise<boolean> {
    return this.mounted;
  }

  async getState(): Promise<PaymentComponentState> {
    return {};
  }

  async showValidation(): Promise<void> {
    // Nuvei-hosted validation is controlled by the Simply Connect widget.
  }

  async isAvailable(): Promise<boolean> {
    try {
      await loadSimplyConnectSdk();
      return true;
    } catch {
      return false;
    }
  }

  private async init(selector: string): Promise<void> {
    const container = document.querySelector(selector);
    if (!container) {
      throw new Error(`Mount target not found: ${selector}`);
    }

    const [paymentRes, checkout] = await Promise.all([
      this.api.createPayment({ paymentMethodOptions: { [PaymentMethod.embedded]: {} } }),
      loadSimplyConnectSdk(),
    ]);

    this.sessionToken = paymentRes.sessionToken;
    this.paymentReference = paymentRes.paymentReference;

    container.innerHTML = "";
    this.container = container;

    checkout({
      sessionToken: this.sessionToken,
      merchant_unique_id: this.paymentReference,
      merchantUniqueId: this.paymentReference,
      merchantUniqueID: this.paymentReference,
      env: this.baseOptions.env === "test" ? "int" : "prod",
      merchantId: this.baseOptions.merchantId,
      merchantSiteId: this.baseOptions.merchantSiteId,
      amount: paymentRes.amount,
      currency: paymentRes.currency,
      locale: this.baseOptions.locale,
      country: this.baseOptions.countryCode ?? "US",
      billingAddress: {
        ...(this.baseOptions.shopperEmail && { email: this.baseOptions.shopperEmail }),
        country: this.baseOptions.countryCode ?? "US",
      },
      renderTo: selector,
      ...this.checkoutOverrides(paymentRes),
      onResult: (result: CheckoutResult) => {
        this.handleCheckoutResult(result);
      },
      onError: (error: unknown) => {
        this.baseOptions.onError?.(makeSafeWidgetError(error), {
          paymentReference: this.paymentReference,
        });
      },
      onPending: () => {
        this.baseOptions.onPending?.({ paymentReference: this.paymentReference });
      },
    });

    this.mounted = true;
    try {
      await this.componentOptions.onDropinReady?.();
    } catch (error) {
      this.baseOptions.onError?.(error, { paymentReference: this.paymentReference });
    }
  }

  private checkoutOverrides(_paymentRes: PaymentSessionResponse): SimplyConnectCheckoutOverrides {
    return {
      pmWhitelist: [...SIMPLY_CONNECT_CARD_WHITELIST],
      prePayment: ((controlsOrResolve, positionalReject) => {
        const controls = normalizePrePaymentControls(controlsOrResolve, positionalReject);
        if (!controls) {
          const error = new Error("Nuvei prePayment controls were invalid.");
          this.baseOptions.onError?.(error, { paymentReference: this.paymentReference });
          if (!rejectInvalidPrePaymentControls(controlsOrResolve, positionalReject)) {
            throw error;
          }
          return;
        }
        void this.prePayment(controls.resolve, controls.reject);
      }) satisfies PrePaymentCallback,
      onPaymentEvent: (event: SimplyConnectPaymentEvent) => {
        const stage = safePaymentEventStage(event);
        if (stage) {
          this.componentOptions.onPaymentEvent?.({ stage });
        }
      },
    };
  }

  private async prePayment(resolve: () => void, reject: (reason?: string) => void): Promise<void> {
    try {
      await this.componentOptions.onPayButtonClick?.();
      resolve();
    } catch (error) {
      this.baseOptions.onError?.(error, { paymentReference: this.paymentReference });
      reject(PRE_PAYMENT_REJECTION_MESSAGE);
    }
  }

  private handleCheckoutResult(result: CheckoutResult): void {
    if (result.cancelled) {
      this.baseOptions.onComplete?.({ isSuccess: false, paymentReference: this.paymentReference });
      this.cleanupCheckoutOverlay();
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

    this.cleanupCheckoutOverlay();
  }

  private cleanupCheckoutOverlay(): void {
    this.container
      ?.querySelectorAll('[id*="checkoutOverlay"], [class*="checkoutOverlay"]')
      .forEach((el) => el.remove());
  }
}

function safePaymentEventStage(event: SimplyConnectPaymentEvent): SafePaymentEventStage | undefined {
  let stage: unknown;
  if (typeof event === "string") {
    stage = event;
  } else if (typeof event === "object" && event !== null) {
    const record = event as Record<string, unknown>;
    stage = record.stage ?? record.eventName ?? record.name ?? record.type;
  }

  if (typeof stage !== "string") return undefined;
  return isSafePaymentEventStage(stage) ? stage : undefined;
}

function isSafePaymentEventStage(stage: string): stage is SafePaymentEventStage {
  return Object.hasOwn(SAFE_PAYMENT_EVENT_STAGES, stage);
}

function normalizePrePaymentControls(
  controlsOrResolve: PrePaymentControls | (() => void),
  positionalReject?: (reason?: string) => void,
): PrePaymentControls | undefined {
  if (typeof controlsOrResolve === "function") {
    return typeof positionalReject === "function"
      ? { resolve: controlsOrResolve, reject: positionalReject }
      : undefined;
  }

  if (
    typeof controlsOrResolve === "object" &&
    controlsOrResolve !== null &&
    typeof controlsOrResolve.resolve === "function" &&
    typeof controlsOrResolve.reject === "function"
  ) {
    return controlsOrResolve;
  }

  return undefined;
}

function rejectInvalidPrePaymentControls(
  controlsOrResolve: PrePaymentControls | (() => void),
  positionalReject?: (reason?: string) => void,
): boolean {
  if (typeof positionalReject === "function") {
    positionalReject(PRE_PAYMENT_REJECTION_MESSAGE);
    return true;
  }

  if (typeof controlsOrResolve === "object" && controlsOrResolve !== null) {
    const reject = (controlsOrResolve as Partial<PrePaymentControls>).reject;
    if (typeof reject === "function") {
      reject(PRE_PAYMENT_REJECTION_MESSAGE);
      return true;
    }
  }

  return false;
}

function makeSafeWidgetError(error: unknown): Error {
  const cause = safeWidgetErrorCause(error);
  return cause
    ? new Error(SIMPLY_CONNECT_WIDGET_ERROR_MESSAGE, { cause })
    : new Error(SIMPLY_CONNECT_WIDGET_ERROR_MESSAGE);
}

function safeWidgetErrorCause(error: unknown): SafeWidgetErrorCause | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const record = error as Record<string, unknown>;
  const cause: SafeWidgetErrorCause = {};
  if (typeof record.name === "string" && isSafeDiagnosticCode(record.name)) {
    cause.name = record.name;
  }

  const code = record.errCode ?? record.errorCode ?? record.code;
  if (isSafeDiagnosticCode(code)) {
    cause.code = code;
  }

  return Object.keys(cause).length > 0 ? cause : undefined;
}

function isSafeDiagnosticCode(value: unknown): value is string | number {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
