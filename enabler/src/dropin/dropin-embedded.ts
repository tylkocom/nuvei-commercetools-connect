/**
 * Embedded drop-in builder and component using Nuvei Simply Connect.
 *
 * Renders the Simply Connect checkout widget inside the merchant page.
 * The widget handles all payment methods, card input, validation, 3DS, and submission.
 */

import type {
  DropinComponent,
  DropinOptions,
  EnablerOptions,
  PaymentDropinBuilder,
} from "../payment-enabler/payment-enabler.js";
import { PaymentMethod } from "../payment-enabler/payment-enabler.js";
import { apiService, confirmPaymentResult } from "../services/api-service.js";
import { loadNuveiSdk, type CheckoutResult } from "../services/nuvei-sdk.js";

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
  private sessionToken = "";
  private paymentReference = "";

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
    throw new Error("Simply Connect handles submission internally via the widget pay button.");
  }

  // -- private helpers ------------------------------------------------------

  /** Fetches session data from the processor and renders the Simply Connect widget. */
  private async initNuveiWidget(selector: string): Promise<void> {
    try {
      // 1. Obtain session token and load SDK in parallel.
      const [paymentRes, checkout] = await Promise.all([
        this.api.createPayment({ paymentMethodOptions: { [PaymentMethod.embedded]: {} } }),
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

      // 2. Notify the host that the drop-in is ready.
      await this.dropinOptions.onDropinReady?.();
    } catch (error) {
      this.baseOptions.onError?.(error);
    }
  }

  private handleCheckoutResult(result: CheckoutResult): void {
    console.log("[NuveiEnabler] Simply Connect onResult:", JSON.stringify(result));

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
