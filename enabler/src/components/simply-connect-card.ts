/** Nuvei Simply Connect card component. */

import type {
  ComponentOptions,
  EnablerOptions,
  PaymentComponent,
  PaymentComponentBuilder,
  PaymentComponentState,
} from "../payment-enabler/payment-enabler.js";
import { PaymentMethod } from "../payment-enabler/payment-enabler.js";
import type { ApiService } from "../services/api-service.js";
import { apiService, confirmPaymentResult } from "../services/api-service.js";
import { loadSimplyConnectSdk, type CheckoutResult } from "../services/simply-connect-sdk.js";

export class SimplyConnectCardBuilder implements PaymentComponentBuilder {
  public componentHasSubmit = false;

  constructor(private readonly opts: EnablerOptions) {}

  build(config: ComponentOptions): PaymentComponent {
    return new SimplyConnectCardComponent(this.opts, config);
  }
}

class SimplyConnectCardComponent implements PaymentComponent {
  private mounted = false;
  private readonly api: ApiService;
  private sessionToken = "";
  private paymentReference = "";
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

  async submit(): Promise<void> {
    throw new Error("Simply Connect handles submission internally via the widget pay button.");
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
    void this.componentOptions;

    const [paymentRes, checkout] = await Promise.all([
      this.api.createPayment({ paymentMethodOptions: { [PaymentMethod.card]: {} } }),
      loadSimplyConnectSdk(),
    ]);

    this.sessionToken = paymentRes.sessionToken;
    this.paymentReference = paymentRes.paymentReference;

    const container = document.querySelector(selector);
    if (!container) {
      throw new Error(`Mount target not found: ${selector}`);
    }

    container.innerHTML = "";

    checkout({
      sessionToken: this.sessionToken,
      env: this.baseOptions.env === "test" ? "int" : "prod",
      merchantId: this.baseOptions.merchantId,
      merchantSiteId: this.baseOptions.merchantSiteId,
      amount: paymentRes.amount,
      currency: paymentRes.currency,
      locale: this.baseOptions.locale,
      country: this.baseOptions.countryCode ?? "US",
      billingAddress: {
        email: "sandbox@example.com",
        country: this.baseOptions.countryCode ?? "US",
      },
      renderTo: selector,
      onResult: (result: CheckoutResult) => {
        this.handleCheckoutResult(result);
      },
    });

    this.mounted = true;
  }

  private handleCheckoutResult(result: CheckoutResult): void {
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

    this.cleanupCheckoutOverlay();
  }

  private cleanupCheckoutOverlay(): void {
    const overlays = document.querySelectorAll(
      '[id*="checkoutOverlay"], [class*="checkoutOverlay"]',
    );
    overlays.forEach((el) => el.remove());
  }
}
