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
  SUPPORTED_PAYMENT_METHODS,
  validateEnablerOptions,
} from "./payment-enabler/payment-enabler.js";
import { DropinEmbeddedBuilder } from "./dropin/dropin-embedded.js";
import { CardComponentBuilder } from "./components/card.js";

export * from "./payment-enabler/payment-enabler.js";
export { CardComponentBuilder } from "./components/card.js";
export { DropinEmbeddedBuilder } from "./dropin/dropin-embedded.js";

export class NuveiEnabler implements PaymentEnabler {
  private opts: import("./payment-enabler/payment-enabler.js").EnablerOptions;

  constructor(opts: import("./payment-enabler/payment-enabler.js").EnablerOptions) {
    validateEnablerOptions(opts);
    this.opts = opts;
  }

  async createComponentBuilder(type: string): Promise<PaymentComponentBuilder> {
    if (type === PaymentMethod.card) {
      return new CardComponentBuilder(this.opts);
    }
    throw new Error(
      `Component type "${type}" is not supported. Supported methods: ${SUPPORTED_PAYMENT_METHODS.join(", ")}.`,
    );
  }

  async createDropinBuilder(type: DropinType): Promise<PaymentDropinBuilder> {
    if (type !== DropinType.embedded) {
      throw new Error(`Dropin type "${type}" is not supported.`);
    }
    return new DropinEmbeddedBuilder(this.opts);
  }
}
