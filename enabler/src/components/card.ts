import type {
  ComponentOptions,
  EnablerOptions,
  PaymentComponent,
  PaymentComponentBuilder,
} from "../payment-enabler/payment-enabler.js";
import { PaymentMethod } from "../payment-enabler/payment-enabler.js";
import { apiService, confirmPaymentResult } from "../services/api-service.js";
import { loadNuveiSdk, type NuveiResult } from "../services/nuvei-sdk.js";

export class CardComponentBuilder implements PaymentComponentBuilder {
  public componentHasSubmit = false;

  constructor(private readonly opts: EnablerOptions) {}

  build(config: ComponentOptions): PaymentComponent {
    return new CardComponent(this.opts, config);
  }
}

class CardComponent implements PaymentComponent {
  private mounted = false;
  private readonly api: ReturnType<typeof apiService>;

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
    throw new Error("External submit is not supported by the Nuvei card component.");
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
    const [SafeCharge, paymentRes] = await Promise.all([
      loadNuveiSdk(),
      this.api.createPayment({ paymentMethodOptions: { [PaymentMethod.card]: {} } }),
    ]);

    const sfc = SafeCharge({
      env: this.baseOptions.env === "test" ? "int" : "prod",
      merchantId: this.baseOptions.merchantId,
      merchantSiteId: this.baseOptions.merchantSiteId,
      locale: this.baseOptions.locale,
    });

    sfc.createPayment({
      sessionToken: paymentRes.sessionToken,
      merchant_unique_id: paymentRes.paymentReference,
      cardHolderName: true,
      billingAddress: {
        country: "US",
        email: "",
      },
      renderTo: selector,
      showPayButton: this.componentOptions.showPayButton ?? true,
      onResult: (result: NuveiResult) => {
        this.handleNuveiResult(result, paymentRes.paymentReference);
      },
    });

    this.mounted = true;
  }

  private handleNuveiResult(result: NuveiResult, paymentReference: string): void {
    void confirmPaymentResult(
      result,
      paymentReference,
      this.api,
      this.baseOptions.onComplete,
      this.baseOptions.onError,
    );
  }
}
