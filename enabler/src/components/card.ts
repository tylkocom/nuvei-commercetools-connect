import type {
  ComponentOptions,
  EnablerOptions,
  PaymentComponent,
  PaymentComponentBuilder,
} from "../payment-enabler/payment-enabler.js";
import { PaymentMethod } from "../payment-enabler/payment-enabler.js";
import { apiService, confirmPaymentResult } from "../services/api-service.js";
import { loadNuveiSdk, type CheckoutResult } from "../services/nuvei-sdk.js";

export class CardComponentBuilder implements PaymentComponentBuilder {
  public componentHasSubmit = false;

  constructor(private readonly opts: EnablerOptions) {}

  build(config: ComponentOptions): PaymentComponent {
    return new CardComponent(this.opts, config);
  }
}

/**
 * Nuvei Simply Connect card component.
 *
 * Renders the Simply Connect checkout widget into a container.
 * The widget handles card input, validation, 3DS, and submission.
 */
class CardComponent implements PaymentComponent {
  private mounted = false;
  private readonly api: ReturnType<typeof apiService>;
  private sessionToken = "";
  private paymentReference = "";

  constructor(
    private readonly baseOptions: EnablerOptions,
    private readonly componentOptions: ComponentOptions,
  ) {
    this.api = apiService({
      baseApi: baseOptions.processorUrl,
      sessionId: baseOptions.sessionId,
    });
  }

  mount(selector: string): void {
    this.init(selector).catch((error: unknown) => this.baseOptions.onError?.(error));
  }

  submit(): void {
    throw new Error("Simply Connect handles submission internally via the widget pay button.");
  }

  isValid(): boolean {
    return this.mounted;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await loadNuveiSdk();
      return true;
    } catch {
      return false;
    }
  }

  private async init(selector: string): Promise<void> {
    const [paymentRes, checkout] = await Promise.all([
      this.api.createPayment({ paymentMethodOptions: { [PaymentMethod.card]: {} } }),
      loadNuveiSdk(),
    ]);

    this.sessionToken = paymentRes.sessionToken;
    this.paymentReference = paymentRes.paymentReference;

    const container = document.querySelector(selector);
    if (!container) {
      throw new Error(`Mount target not found: ${selector}`);
    }

    // Clear any previous content
    container.innerHTML = "";

    checkout({
      sessionToken: this.sessionToken,
      env: this.baseOptions.env === "test" ? "int" : "prod",
      merchantId: this.baseOptions.merchantId,
      merchantSiteId: this.baseOptions.merchantSiteId,
      amount: paymentRes.amount,
      currency: paymentRes.currency,
      locale: this.baseOptions.locale,
      country: "US",
      billingAddress: {
        email: "test@example.com",
        country: "US",
      },
      renderTo: selector,
      onResult: (result: CheckoutResult) => {
        this.handleCheckoutResult(result);
      },
    });

    this.mounted = true;
  }

  private handleCheckoutResult(result: CheckoutResult): void {
    console.log("[NuveiEnabler] Simply Connect onResult:", JSON.stringify(result));

    // Map Simply Connect result to our internal NuveiResult shape
    const nuveiResult = {
      transactionStatus: result.transactionStatus,
      sessionToken: result.sessionToken,
      errCode: result.errCode,
      reason: result.reason,
    };

    void confirmPaymentResult(
      nuveiResult,
      this.paymentReference,
      this.sessionToken,
      this.api,
      this.baseOptions.onComplete,
      this.baseOptions.onError,
      this.baseOptions.onPending,
    );

    // Cleanup Simply Connect overlay after result is handled (T-01.1.1-12)
    this.cleanupCheckoutOverlay();
  }

  private cleanupCheckoutOverlay(): void {
    const overlays = document.querySelectorAll(
      '[id*="checkoutOverlay"], [class*="checkoutOverlay"]',
    );
    overlays.forEach((el) => el.remove());
  }
}
