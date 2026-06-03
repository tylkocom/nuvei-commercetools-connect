import { WebSdkCardBuilder } from "../components/web-sdk-card.js";
import { apiService, type ApiService, type ProcessorConfigResponse } from "../services/api-service.js";
import type {
  CheckoutEnablerOptions,
  ComponentOptions,
  EnablerOptions,
  PaymentComponent,
  PaymentComponentBuilder,
  PaymentComponentState,
  PaymentDropinBuilder,
  PaymentEnabler,
  PaymentExpressBuilder,
  StoredComponentBuilder,
  StoredPaymentMethodsOptions,
  StoredPaymentMethodsResult,
  SubmitOptions,
} from "./payment-enabler.js";
import {
  PaymentMethod,
  methodUnsupported,
  validateCheckoutEnablerOptions,
} from "./payment-enabler.js";

function normalizeNuveiEnvironment(environment: string): EnablerOptions["env"] {
  return environment === "production" ? "production" : "test";
}

function toNuveiOptions(
  options: CheckoutEnablerOptions,
  config: ProcessorConfigResponse,
): EnablerOptions {
  return {
    ...options,
    merchantId: config.merchantId,
    merchantSiteId: config.merchantSiteId,
    env: normalizeNuveiEnvironment(config.environment),
  };
}

/**
 * Checkout-facing enabler aligned with the commercetools payment-template API.
 *
 * It intentionally accepts only generic Checkout options. Nuvei merchant
 * configuration is loaded from the processor's authenticated config endpoint.
 */
export class Enabler implements PaymentEnabler {
  private readonly api: ApiService;
  private configPromise: Promise<ProcessorConfigResponse> | undefined;

  constructor(private readonly options: CheckoutEnablerOptions) {
    validateCheckoutEnablerOptions(options);
    this.api = apiService({ baseApi: options.processorUrl, sessionId: options.sessionId });
  }

  async createComponentBuilder(type: string): Promise<PaymentComponentBuilder> {
    if (type !== PaymentMethod.card) {
      throw methodUnsupported(type, "component");
    }

    return new CheckoutCardBuilder(this.options, this.getConfig());
  }

  async createDropinBuilder(type: string): Promise<PaymentDropinBuilder> {
    throw methodUnsupported(type, "dropin");
  }

  async createExpressBuilder(type: string): Promise<PaymentExpressBuilder> {
    throw methodUnsupported(type, "express");
  }

  async createStoredPaymentMethodBuilder(type: string): Promise<StoredComponentBuilder> {
    throw methodUnsupported(type, "stored");
  }

  async isStoredPaymentMethodsEnabled(): Promise<boolean> {
    return false;
  }

  async getStoredPaymentMethods(
    opts?: StoredPaymentMethodsOptions,
  ): Promise<StoredPaymentMethodsResult> {
    void opts;
    return { storedPaymentMethods: [] };
  }

  setStorePaymentDetails(enabled: boolean): void {
    void enabled;
  }

  private getConfig(): Promise<ProcessorConfigResponse> {
    this.configPromise ??= this.api.getConfig();
    return this.configPromise;
  }
}

class CheckoutCardBuilder implements PaymentComponentBuilder {
  public componentHasSubmit = true;

  constructor(
    private readonly options: CheckoutEnablerOptions,
    private readonly configPromise: Promise<ProcessorConfigResponse>,
  ) {}

  build(config: ComponentOptions): PaymentComponent {
    return new CheckoutCardComponent(this.options, this.configPromise, config);
  }
}

class CheckoutCardComponent implements PaymentComponent {
  private delegate: PaymentComponent | undefined;
  private delegatePromise: Promise<PaymentComponent> | undefined;

  constructor(
    private readonly options: CheckoutEnablerOptions,
    private readonly configPromise: Promise<ProcessorConfigResponse>,
    private readonly componentOptions: ComponentOptions,
  ) {}

  async mount(selector: string): Promise<void> {
    const delegate = await this.getDelegate();
    await delegate.mount(selector);
  }

  async submit(options: SubmitOptions = {}): Promise<void> {
    const delegate = await this.getDelegate();
    await delegate.submit(options);
  }

  async showValidation(): Promise<void> {
    const delegate = await this.getDelegate();
    await delegate.showValidation?.();
  }

  async isValid(): Promise<boolean> {
    const delegate = await this.getDelegate();
    return (await delegate.isValid?.()) ?? false;
  }

  async getState(): Promise<PaymentComponentState> {
    const delegate = await this.getDelegate();
    return (await delegate.getState?.()) ?? {};
  }

  async isAvailable(): Promise<boolean> {
    const delegate = await this.getDelegate();
    return (await delegate.isAvailable?.()) ?? true;
  }

  private getDelegate(): Promise<PaymentComponent> {
    if (this.delegate) {
      return Promise.resolve(this.delegate);
    }

    this.delegatePromise ??= this.configPromise.then((config) => {
      const builder = new WebSdkCardBuilder(toNuveiOptions(this.options, config));
      this.delegate = builder.build(this.componentOptions);
      return this.delegate;
    });

    return this.delegatePromise;
  }
}
