import { WebSdkCardBuilder } from "../components/web-sdk-card.js";
import { WebSdkBlikBuilder } from "../components/web-sdk-blik.js";
import { SimplyConnectDropinBuilder } from "../components/simply-connect-dropin.js";
import { apiService, type ApiService, type ProcessorConfigResponse } from "../services/api-service.js";
import type {
  CheckoutEnablerOptions,
  ComponentOptions,
  DropinComponent,
  DropinOptions,
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
    ...(config.simplyConnectPaymentMethod && {
      simplyConnectPaymentMethod: config.simplyConnectPaymentMethod,
    }),
  };
}

type ProcessorConfigLoader = () => Promise<ProcessorConfigResponse>;

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
    if (type === PaymentMethod.card) {
      return new CheckoutCardBuilder(this.options, () => this.getConfig());
    }

    if (type === PaymentMethod.blik) {
      return new CheckoutBlikBuilder(this.options, () => this.getConfig());
    }

    throw methodUnsupported(type, "component");
  }

  async createDropinBuilder(type: string): Promise<PaymentDropinBuilder> {
    if (type !== PaymentMethod.embedded) {
      throw methodUnsupported(type, "dropin");
    }

    return new CheckoutDropinBuilder(this.options, () => this.getConfig());
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
    this.configPromise ??= this.api.getConfig().catch((error: unknown) => {
      this.configPromise = undefined;
      throw error;
    });
    return this.configPromise;
  }
}

type DelegateFactory<TDelegate extends PaymentComponent> = (
  options: EnablerOptions,
) => TDelegate;

class CheckoutDelegateComponent<TDelegate extends PaymentComponent> implements PaymentComponent {
  private delegate: TDelegate | undefined;
  private delegatePromise: Promise<TDelegate> | undefined;

  constructor(
    private readonly options: CheckoutEnablerOptions,
    private readonly loadConfig: ProcessorConfigLoader,
    private readonly createDelegate: DelegateFactory<TDelegate>,
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
    try {
      const delegate = await this.getDelegate();
      return (await delegate.isAvailable?.()) ?? true;
    } catch {
      return false;
    }
  }

  private getDelegate(): Promise<TDelegate> {
    if (this.delegate) {
      return Promise.resolve(this.delegate);
    }

    this.delegatePromise ??= this.loadConfig()
      .then((config) => {
        this.delegate = this.createDelegate(toNuveiOptions(this.options, config));
        return this.delegate;
      })
      .catch((error: unknown) => {
        this.delegatePromise = undefined;
        throw error;
      });

    return this.delegatePromise;
  }
}

class CheckoutCardBuilder implements PaymentComponentBuilder {
  public componentHasSubmit = true;

  constructor(
    private readonly options: CheckoutEnablerOptions,
    private readonly loadConfig: ProcessorConfigLoader,
  ) {}

  build(config: ComponentOptions): PaymentComponent {
    return new CheckoutDelegateComponent(this.options, this.loadConfig, (options) =>
      new WebSdkCardBuilder(options).build(config),
    );
  }
}

class CheckoutBlikBuilder implements PaymentComponentBuilder {
  public componentHasSubmit = true;

  constructor(
    private readonly options: CheckoutEnablerOptions,
    private readonly loadConfig: ProcessorConfigLoader,
  ) {}

  build(config: ComponentOptions): PaymentComponent {
    return new CheckoutDelegateComponent(this.options, this.loadConfig, (options) =>
      new WebSdkBlikBuilder(options).build(config),
    );
  }
}

class CheckoutDropinBuilder implements PaymentDropinBuilder {
  public dropinHasSubmit = false;

  constructor(
    private readonly options: CheckoutEnablerOptions,
    private readonly loadConfig: ProcessorConfigLoader,
  ) {}

  build(config: DropinOptions): DropinComponent {
    return new CheckoutDelegateComponent<DropinComponent>(this.options, this.loadConfig, (options) =>
      new SimplyConnectDropinBuilder(options).build(config),
    );
  }
}
