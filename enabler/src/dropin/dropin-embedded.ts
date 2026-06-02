/**
 * Embedded drop-in builder and component.
 *
 * Dynamically loads the Nuvei Simply Connect (SafeCharge) Web SDK,
 * fetches a session token from the processor, and renders the widget
 * inside the merchant's page.
 */

import type {
  DropinComponent,
  DropinOptions,
  EnablerOptions,
  PaymentDropinBuilder,
} from "../payment-enabler/payment-enabler.js";
import { apiService, confirmPaymentResult } from "../services/api-service.js";
import { loadNuveiSdk, type NuveiResult } from "../services/nuvei-sdk.js";

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class DropinEmbeddedBuilder implements PaymentDropinBuilder {
  public dropinHasSubmit = false;

  private opts: EnablerOptions;

  constructor(opts: EnablerOptions) {
    this.opts = opts;
  }

  build(config: DropinOptions): DropinComponent {
    return new DropinComponents({
      baseOptions: this.opts,
      dropinOptions: config,
    });
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

class DropinComponents implements DropinComponent {
  private readonly baseOptions: EnablerOptions;
  private readonly dropinOptions: DropinOptions;
  private readonly api: ReturnType<typeof apiService>;

  constructor(opts: { baseOptions: EnablerOptions; dropinOptions: DropinOptions }) {
    this.baseOptions = opts.baseOptions;
    this.dropinOptions = opts.dropinOptions;
    this.api = apiService({
      baseApi: opts.baseOptions.processorUrl,
      sessionId: opts.baseOptions.sessionId,
    });
  }

  // -- public interface -----------------------------------------------------

  mount(selector: string): void {
    this.initNuveiWidget(selector).catch((error: unknown) => this.baseOptions.onError?.(error));
  }

  submit(): void {
    throw new Error("External submit is not supported by the Nuvei drop-in.");
  }

  // -- private helpers ------------------------------------------------------

  /** Fetches session data from the processor and renders the widget. */
  private async initNuveiWidget(selector: string): Promise<void> {
    try {
      // 1. Obtain session token and load SDK in parallel.
      const [paymentRes, SafeCharge] = await Promise.all([
        this.api.createPayment({ paymentMethodOptions: { dropin: {} } }),
        loadNuveiSdk(),
      ]);

      const sfc = SafeCharge({
        env: this.baseOptions.env === "test" ? "int" : "prod",
        merchantId: this.baseOptions.merchantId,
        merchantSiteId: this.baseOptions.merchantSiteId,
        locale: this.baseOptions.locale,
      });

      // 2. Create and render the payment form.
      sfc.createPayment({
        sessionToken: paymentRes.sessionToken,
        merchant_unique_id: paymentRes.paymentReference,
        cardHolderName: true,
        billingAddress: {
          country: "US",
          email: "",
        },
        renderTo: selector,
        onResult: (result: NuveiResult) => {
          this.handleNuveiResult(result, paymentRes.paymentReference);
        },
      });

      // 3. Notify the host that the drop-in is ready.
      await this.dropinOptions.onDropinReady?.();
    } catch (error) {
      this.baseOptions.onError?.(error);
    }
  }

  /** Processes the result callback from the Nuvei widget. */
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
