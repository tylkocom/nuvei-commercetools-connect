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
  PrePaymentPayload,
  SimplyConnectPaymentEvent,
} from "../services/simply-connect-sdk.js";
import { loadSimplyConnectSdk } from "../services/simply-connect-sdk.js";

// Card-only by design: non-card Simply Connect APMs stay hidden until each method has
// dedicated Nuvei setup, DMN mapping, operation support, fixtures, and runbook evidence.
const SIMPLY_CONNECT_CARD_WHITELIST = ["cc_card"] as const;
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
  private dropinReadyFired = false;

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
      // Default to Nuvei integration ("int") for every non-production environment.
      // `EnablerOptions.env` is "test" | "production", but a stray runtime value
      // must never fall through to "prod" (live) — only an explicit "production"
      // maps to prod.
      env: this.baseOptions.env === "production" ? "prod" : "int",
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
      // Real post-render readiness signal (checkout.js: `onReady?.({loaded:true})`).
      // Placed after the overrides spread so a future override can never shadow
      // the real Nuvei readiness signal. Drives `onDropinReady` once the widget
      // is actually interactive — never fired eagerly after `checkout()` returns.
      //
      // Failure assumption: if rendering fails, Nuvei surfaces it via `onError`
      // (wired below) rather than going silent, so the host is never left
      // waiting indefinitely for a readiness signal that will never come.
      onReady: () => {
        this.fireOnDropinReady();
      },
      onResult: (result: CheckoutResult) => {
        this.handleCheckoutResult(result);
      },
      onError: (error: unknown) => {
        this.baseOptions.onError?.(makeSafeWidgetError(error), {
          paymentReference: this.paymentReference,
        });
      },
    });

    this.mounted = true;
  }

  private fireOnDropinReady(): void {
    // Single-fire: Nuvei documents `onReady` as fire-once, but guard defensively
    // so a duplicate emission (e.g. re-render after a challenge dismissal) can
    // never deliver a second readiness signal to the host.
    if (this.dropinReadyFired) return;
    this.dropinReadyFired = true;
    // Defer the host callback into a `.then` so BOTH synchronous throws and async
    // rejections become promise rejections caught by `.catch` — a sync throw from
    // a non-async callback would otherwise escape into Nuvei's `checkout.js`.
    Promise.resolve()
      .then(() => this.componentOptions.onDropinReady?.())
      .catch((error) => {
        this.baseOptions.onError?.(error, { paymentReference: this.paymentReference });
      });
  }

  private checkoutOverrides(_paymentRes: PaymentSessionResponse): SimplyConnectCheckoutOverrides {
    return {
      pmWhitelist: [...SIMPLY_CONNECT_CARD_WHITELIST],
      // Verified Simply Connect v1 contract (checkout.js): Nuvei calls
      // `prePayment(payload)` with a single masked-card payload object and chains
      // `.then()` on the return value. Resolve !== false means proceed; resolve ===
      // false (or a rejected promise) means abort. The payload carries masked
      // cardholder data and is intentionally ignored — never logged or forwarded.
      prePayment: ((_payload: PrePaymentPayload) => {
        return this.prePayment();
      }) satisfies PrePaymentCallback,
      onPaymentEvent: (event: SimplyConnectPaymentEvent) => {
        const stage = safePaymentEventStage(event);
        if (stage) {
          this.componentOptions.onPaymentEvent?.({ stage });
        }
      },
    };
  }

  private async prePayment(): Promise<boolean> {
    try {
      await this.componentOptions.onPayButtonClick?.();
      return true;
    } catch (error) {
      this.baseOptions.onError?.(error, { paymentReference: this.paymentReference });
      return false;
    }
  }

  private handleCheckoutResult(result: CheckoutResult): void {
    // Strict boolean check mirrors Nuvei's own `true === e.cancelled` guard so a
    // malformed/truthy non-boolean value can never short-circuit a real outcome
    // into an unsuccessful completion. The processor remains the source of truth.
    if (result.cancelled === true) {
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
    // Verified shape is always an object with `eventType` (below). This bare-string
    // branch is retained as deliberate defensive handling for an unverified but
    // plausible emission path — it is cheap, type-permitted, and still gated by the
    // whitelist below, so it can only ever forward a known-safe stage name.
    stage = event;
  } else if (typeof event === "object" && event !== null) {
    const record = event as Record<string, unknown>;
    // Verified Simply Connect v1 contract: payment events are emitted as
    // `onPaymentEvent.call(void 0, e)` where the stage lives on `e.eventType`.
    stage = record.eventType;
  }

  if (typeof stage !== "string") return undefined;
  return isSafePaymentEventStage(stage) ? stage : undefined;
}

function isSafePaymentEventStage(stage: string): stage is SafePaymentEventStage {
  return Object.hasOwn(SAFE_PAYMENT_EVENT_STAGES, stage);
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
