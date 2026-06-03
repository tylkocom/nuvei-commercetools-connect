import type { ComponentOptions, EnablerOptions, PaymentComponent, PaymentComponentBuilder } from "../payment-enabler/payment-enabler.js";
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
    if (!this.sfc || !this.scard) {
      throw new Error("WebSdkCardComponent: not mounted yet");
    }

    this.sfc.createPayment(
      {
        sessionToken: this.sessionToken,
        paymentOption: this.scard,
        billingAddress: {
          /* SANDBOX-ONLY: Phase 4 will source real data. */
          email: "sandbox@example.com",
          country: "US",
        },
      },
      (res: SafeChargeResult) => {
        void this.handleWebSdkResult(res);
      },
    );
  }

  isValid(): boolean {
    return !!this.scard;
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
    const normalized = {
      transactionStatus: res.result,
      errCode: res.errCode,
    };

    void confirmPaymentResult(
      normalized,
      this.paymentReference,
      this.sessionToken,
      this.api,
      this.baseOptions.onComplete,
      this.baseOptions.onError,
      this.baseOptions.onPending,
    );
  }
}
