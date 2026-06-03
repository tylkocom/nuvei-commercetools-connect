/**
 * Nuvei Simply Connect Enabler – public interface definitions.
 *
 * These types model the contract between the commercetools Checkout
 * (or a custom storefront) and the Nuvei payment widget.
 */

import { SUPPORTED_PAYMENT_METHODS } from "./method-registry.js";
import type { PaymentMethodKey } from "./method-registry.js";
export {
  PaymentMethod,
  PAYMENT_METHOD_REGISTRY,
  SUPPORTED_PAYMENT_METHODS,
  getComponentPaymentMethods,
  getPaymentMethodRegistryEntry,
  isSupportedPaymentMethod,
} from "./method-registry.js";
export type {
  PaymentMethodKey,
  PaymentMethodKind,
  PaymentMethodRegistryEntry,
} from "./method-registry.js";

export const PublicPaymentErrorCode = {
  CONFIG_INVALID: "CONFIG_INVALID",
  METHOD_UNSUPPORTED: "METHOD_UNSUPPORTED",
  REQUEST_MALFORMED: "REQUEST_MALFORMED",
  AUTH_SESSION_INVALID: "AUTH_SESSION_INVALID",
} as const;

export type PublicPaymentErrorCode =
  (typeof PublicPaymentErrorCode)[keyof typeof PublicPaymentErrorCode];

export type PublicPaymentError = {
  code: PublicPaymentErrorCode;
  message: string;
};

export class PaymentSetupError extends Error implements PublicPaymentError {
  constructor(
    public readonly code: PublicPaymentErrorCode,
    message: string,
    public readonly diagnostics: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PaymentSetupError";
  }

  toPublicError(): PublicPaymentError {
    return { code: this.code, message: this.message };
  }
}

function configInvalid(field: string, expectation: string): PaymentSetupError {
  return new PaymentSetupError(
    PublicPaymentErrorCode.CONFIG_INVALID,
    `Invalid enabler configuration: ${field} ${expectation}.`,
    { field, reason: expectation },
  );
}

export function methodUnsupported(method: string, kind: "component"): PaymentSetupError {
  return new PaymentSetupError(
    PublicPaymentErrorCode.METHOD_UNSUPPORTED,
    `Unsupported ${kind} payment method. Supported methods: ${SUPPORTED_PAYMENT_METHODS.join(", ")}.`,
    { method, kind },
  );
}
export function modeUnsupported(mode: unknown): PaymentSetupError {
  return new PaymentSetupError(
    PublicPaymentErrorCode.METHOD_UNSUPPORTED,
    "Unsupported or missing Nuvei integration mode. Supported modes: simply-connect, web-sdk.",
    { mode },
  );
}


function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

type EnablerOptionsInput = Partial<Record<keyof EnablerOptions, unknown>>;

/**
 * Validate enabler options at runtime and return an actionable safe error
 * describing the first problem found.
 *
 * @throws {PaymentSetupError} When any required option is missing or invalid.
 */
export function validateEnablerOptions(opts: EnablerOptions): void {
  const candidate = opts as EnablerOptionsInput;

  if (!isNonEmptyString(candidate.processorUrl)) {
    throw configInvalid("processorUrl", "must be a non-empty URL string");
  }

  try {
    new URL(candidate.processorUrl);
  } catch {
    throw configInvalid("processorUrl", "must be a valid URL");
  }

  if (!isNonEmptyString(candidate.sessionId)) {
    throw configInvalid("sessionId", "must be a non-empty string");
  }

  if (!isNonEmptyString(candidate.merchantId)) {
    throw configInvalid("merchantId", "must be a non-empty string");
  }

  if (!isNonEmptyString(candidate.merchantSiteId)) {
    throw configInvalid("merchantSiteId", "must be a non-empty string");
  }

  if (candidate.env !== "test" && candidate.env !== "production") {
    throw configInvalid("env", 'must be "test" or "production"');
  }
}

/**
 * Entry point for creating payment components.
 *
 * Usage:
 *   const enabler = new NuveiEnabler({
 *     processorUrl: '…',
 *     sessionId:    '…',
 *     merchantId:   '…',
 *     merchantSiteId: '…',
 *     env:          'test',
 *     onComplete:   (result) => { … },
 *   }, 'simply-connect');
 *
 *   const builder = await enabler.createComponentBuilder(PaymentMethod.card);
 *   const component = builder.build({ showPayButton: true });
 *   component.mount('#payment-container');
 */
export interface PaymentEnabler {
  createComponentBuilder(type: PaymentMethodKey | string): Promise<PaymentComponentBuilder>;
}

/**
 * A mounted payment component (e.g. a card element).
 */
export interface PaymentComponent {
  mount(selector: string): void;
  submit(): void;
  isValid?(): boolean;
  getState?(): {
    card?: {
      endDigits?: string;
      brand?: string;
      expiryDate?: string;
    };
  };
  isAvailable?(): Promise<boolean>;
}

/**
 * Builds a {@link PaymentComponent} from configuration.
 */
export interface PaymentComponentBuilder {
  componentHasSubmit?: boolean;
  build(config: ComponentOptions): PaymentComponent;
}

/**
 * Options passed to {@link NuveiEnabler} at construction time.
 */
export type EnablerOptions = {
  /** Base URL of the Nuvei processor backend. */
  processorUrl: string;
  /** commercetools session identifier forwarded as X-Session-ID. */
  sessionId: string;
  /** Locale string (e.g. "en_US"). Forwarded to the Nuvei widget when provided. */
  locale?: string;
  /** Nuvei merchant identifier. */
  merchantId: string;
  /** Nuvei merchant site identifier. */
  merchantSiteId: string;
  /** Nuvei environment: "test" maps to SafeCharge integration, "production" to live. */
  env: "test" | "production";
  /** Called when the Nuvei widget reports a completed payment. */
  onComplete?: (result: PaymentResult) => void;
  /** Called when the Nuvei widget or the enabler encounters an error. */
  onError?: (error: unknown) => void;
  /**
   * Called when the processor confirms the payment is pending (inconclusive
   * state). The payment is neither approved nor rejected at this point.
   * No polling is performed — the merchant should await a DMN webhook.
   */
  onPending?: (result: PendingPaymentResult) => void;
};

/**
 * Result returned by the Nuvei widget on payment completion.
 */
export type PaymentResult =
  | { isSuccess: true; paymentReference: string; sessionToken: string }
  | { isSuccess: false };

/**
 * Result passed to {@link EnablerOptions.onPending} when the processor
 * returns a pending confirmation outcome.
 */
export type PendingPaymentResult = {
  paymentReference: string;
  sessionToken: string;
};

/**
 * Options for individual payment component builders.
 */
export type ComponentOptions = {
  showPayButton?: boolean;
  onPayButtonClick?: () => Promise<void>;
};
