/**
 * Nuvei Simply Connect Enabler for commercetools Checkout.
 *
 * This library wraps the Nuvei frontend widget and exposes a standard
 * interface that commercetools Checkout (and custom storefronts) can consume.
 */

import type {
  PaymentComponentBuilder,
  PaymentDropinBuilder,
  PaymentEnabler,
} from "./payment-enabler/payment-enabler.js";
import {
  DropinType,
  PaymentMethod,
  getComponentPaymentMethods,
  getDropinPaymentMethods,
  methodUnsupported,
  validateEnablerOptions,
} from "./payment-enabler/payment-enabler.js";
import { DropinEmbeddedBuilder } from "./dropin/dropin-embedded.js";
import { CardComponentBuilder } from "./components/card.js";

export * from "./payment-enabler/payment-enabler.js";
export { CardComponentBuilder } from "./components/card.js";
export { DropinEmbeddedBuilder } from "./dropin/dropin-embedded.js";

const COMPONENT_BUILDERS = {
  [PaymentMethod.card]: CardComponentBuilder,
} as const;

const DROPIN_BUILDERS = {
  [PaymentMethod.embedded]: DropinEmbeddedBuilder,
} as const;

const SUPPORTED_COMPONENT_METHODS = getComponentPaymentMethods().map((entry) => entry.key);
const SUPPORTED_DROPIN_METHODS = getDropinPaymentMethods().map((entry) => entry.key);

export class NuveiEnabler implements PaymentEnabler {
  private opts: import("./payment-enabler/payment-enabler.js").EnablerOptions;

  constructor(opts: import("./payment-enabler/payment-enabler.js").EnablerOptions) {
    validateEnablerOptions(opts);
    this.opts = opts;
  }

  async createComponentBuilder(type: string): Promise<PaymentComponentBuilder> {
    if ((SUPPORTED_COMPONENT_METHODS as readonly string[]).includes(type)) {
      const Builder = COMPONENT_BUILDERS[type as keyof typeof COMPONENT_BUILDERS];
      return new Builder(this.opts);
    }
    throw methodUnsupported(type, "component");
  }

  async createDropinBuilder(type: DropinType | string): Promise<PaymentDropinBuilder> {
    if ((SUPPORTED_DROPIN_METHODS as readonly string[]).includes(type)) {
      const Builder = DROPIN_BUILDERS[type as keyof typeof DROPIN_BUILDERS];
      return new Builder(this.opts);
    }
    throw methodUnsupported(type, "dropin");
  }
}
