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

    const clickOptions = await this.componentOptions.onPayButtonClick?.();
    const storePaymentDetails = clickOptions?.storePaymentDetails ?? options.storePaymentDetails;

    this.sfc.createPayment(
      {
        sessionToken: this.sessionToken,
        clientUniqueId: this.cartId,
        merchant_unique_id: this.paymentReference,
        merchantUniqueId: this.paymentReference,
        merchantUniqueID: this.paymentReference,
        paymentOption: this.scard,
        // Only attach billingAddress when we actually hold shopper data: an
        // explicit billingAddress REPLACES the openOrder pre-fill wholesale
        // at the gateway, and one without an email trips the mandatory-field
        // rules (gateway error 1136). The processor pre-fills shopper details
        // on the order from the cart, so omitting it here is the safe default.
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
    return !!this.scard;
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

    const scFields = sfc.fields({});
    this.scard = scFields.create("card", {});
    this.scard.attach(container);
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
