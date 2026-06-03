/**
 * Nuvei Simply Connect / Web SDK Enabler for commercetools Checkout.
 *
 * This library wraps the Nuvei frontend widgets and exposes a standard
 * interface that commercetools Checkout (and custom storefronts) can consume.
 */

import type {
  EnablerOptions,
  PaymentComponentBuilder,
  PaymentEnabler,
} from "./payment-enabler/payment-enabler.js";
import {
  PaymentMethod,
  methodUnsupported,
  modeUnsupported,
  validateEnablerOptions,
} from "./payment-enabler/payment-enabler.js";
import { SimplyConnectCardBuilder } from "./components/simply-connect-card.js";
import { WebSdkCardBuilder } from "./components/web-sdk-card.js";

export * from "./payment-enabler/payment-enabler.js";
export { SimplyConnectCardBuilder } from "./components/simply-connect-card.js";
export { WebSdkCardBuilder } from "./components/web-sdk-card.js";

export class NuveiSimplyConnectEnabler implements PaymentEnabler {
  constructor(private readonly opts: EnablerOptions) {
    validateEnablerOptions(opts);
  }

  async createComponentBuilder(type: string): Promise<PaymentComponentBuilder> {
    if (type !== PaymentMethod.card) {
      throw methodUnsupported(type, "component");
    }

    return new SimplyConnectCardBuilder(this.opts);
  }
}

export class NuveiWebSdkEnabler implements PaymentEnabler {
  constructor(private readonly opts: EnablerOptions) {
    validateEnablerOptions(opts);
  }

  async createComponentBuilder(type: string): Promise<PaymentComponentBuilder> {
    if (type !== PaymentMethod.card) {
      throw methodUnsupported(type, "component");
    }

    return new WebSdkCardBuilder(this.opts);
  }
}

export class NuveiEnabler implements PaymentEnabler {
  private readonly delegate: PaymentEnabler;

  constructor(opts: EnablerOptions, mode: "simply-connect" | "web-sdk") {
    if (mode !== "simply-connect" && mode !== "web-sdk") {
      throw modeUnsupported(mode);
    }

    this.delegate =
      mode === "simply-connect"
        ? new NuveiSimplyConnectEnabler(opts)
        : new NuveiWebSdkEnabler(opts);
  }

  createComponentBuilder(type: string): Promise<PaymentComponentBuilder> {
    return this.delegate.createComponentBuilder(type);
  }
}
