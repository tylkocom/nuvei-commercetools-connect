/**
 * Nuvei payment enabler public interface definitions.
 *
 * The `Enabler` export is intentionally aligned with the commercetools
 * payment-template contract so whitelabel Checkout can instantiate the
 * connector without Nuvei-specific constructor knowledge.
 */

import {
  SUPPORTED_PAYMENT_METHODS,
  getComponentPaymentMethods,
  getDropinPaymentMethods,
} from "./method-registry.js";
import type { PaymentMethodKey } from "./method-registry.js";
export {
  PaymentMethod,
  PAYMENT_METHOD_REGISTRY,
  SUPPORTED_PAYMENT_METHODS,
  getComponentPaymentMethods,
  getDropinPaymentMethods,
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

export function methodUnsupported(method: string, kind: string): PaymentSetupError {
  const supportedMethods = supportedMethodsForKind(kind);
  return new PaymentSetupError(
    PublicPaymentErrorCode.METHOD_UNSUPPORTED,
    `Unsupported ${kind} payment method. Supported methods: ${supportedMethods.join(", ")}.`,
    { method, kind },
  );
}

function supportedMethodsForKind(kind: string): readonly string[] {
  if (kind === "component") return getComponentPaymentMethods().map((entry) => entry.key);
  if (kind === "dropin") return getDropinPaymentMethods().map((entry) => entry.key);
  return SUPPORTED_PAYMENT_METHODS;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateBaseEnablerOptions(opts: CheckoutEnablerOptions): void {
  const candidate = opts as Partial<Record<keyof CheckoutEnablerOptions, unknown>>;

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
}

/**
 * Validate the template-compatible Checkout enabler options.
 */
export function validateCheckoutEnablerOptions(opts: CheckoutEnablerOptions): void {
  validateBaseEnablerOptions(opts);
}

/**
 * Validate Nuvei-specific concrete enabler options.
 *
 * @throws {PaymentSetupError} When any required option is missing or invalid.
 */
export function validateEnablerOptions(opts: EnablerOptions): void {
  validateBaseEnablerOptions(opts);
  const candidate = opts as Partial<Record<keyof EnablerOptions, unknown>>;

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

/** Entry point for creating payment components. */
export interface PaymentEnabler {
  createComponentBuilder(type: PaymentMethodKey | string): Promise<PaymentComponentBuilder>;
  createDropinBuilder(type: string): Promise<PaymentDropinBuilder>;
  createExpressBuilder?(type: string): Promise<PaymentExpressBuilder>;
  createStoredPaymentMethodBuilder?(type: string): Promise<StoredComponentBuilder>;
  isStoredPaymentMethodsEnabled?(): Promise<boolean>;
  getStoredPaymentMethods?(opts?: StoredPaymentMethodsOptions): Promise<StoredPaymentMethodsResult>;
  setStorePaymentDetails?(enabled: boolean): void;
}

export type PaymentComponentState = {
  card?: {
    endDigits?: string;
    brand?: string;
    expiryDate?: string;
  };
};

/** A mounted payment component (for example, a card element). */
export interface PaymentComponent {
  mount(selector: string): Promise<void>;
  submit(options?: SubmitOptions): Promise<void>;
  showValidation?(): Promise<void>;
  isValid?(): Promise<boolean>;
  getState?(): Promise<PaymentComponentState>;
  isAvailable?(): Promise<boolean>;
}

/** Builds a {@link PaymentComponent} from configuration. */
export interface PaymentComponentBuilder {
  componentHasSubmit?: boolean;
  build(config: ComponentOptions): PaymentComponent;
}

export type SubmitOptions = {
  storePaymentDetails?: boolean;
};

/** Options accepted by the Checkout-facing `Enabler` adapter. */
export type CheckoutEnablerOptions = {
  /** Base URL of the Nuvei processor backend. */
  processorUrl: string;
  /** commercetools session identifier forwarded as X-Session-ID. */
  sessionId: string;
  /** Locale string forwarded to the Nuvei widget when provided. */
  locale?: string;
  /** Shopper country code forwarded to Nuvei when available. */
  countryCode?: string;
  /** Shopper email forwarded to Nuvei when available; omitted otherwise. */
  shopperEmail?: string;
  /** Called when additional payment action is required. */
  onActionRequired?: () => Promise<void>;
  /** Called when the processor confirms the payment is approved. */
  onComplete?: (result: PaymentResult) => void;
  /** Called when an error occurs. */
  onError?: (error: unknown, context?: { paymentReference?: string }) => void;
  /**
   * Nuvei extension: called when the processor confirms the payment is pending.
   * The payment is not terminal; final state should arrive through DMN.
   */
  onPending?: (result: PendingPaymentResult) => void;
};

/** Nuvei-specific concrete enabler options. */
export type EnablerOptions = CheckoutEnablerOptions & {
  /** Nuvei merchant identifier. */
  merchantId: string;
  /** Nuvei merchant site identifier. */
  merchantSiteId: string;
  /** Nuvei environment: "test" maps to SafeCharge integration, "production" to live. */
  env: "test" | "production";
};

/** Result returned to the host when payment completion is known. */
export type PaymentResult =
  | { isSuccess: true; paymentReference: string }
  | { isSuccess: false; paymentReference?: string };

/** Result passed to {@link CheckoutEnablerOptions.onPending}. */
export type PendingPaymentResult = {
  paymentReference: string;
};

/** Options for individual payment component builders. */
export type ComponentOptions = {
  showPayButton?: boolean;
  onPayButtonClick?: () => Promise<void | SubmitOptions>;
};

export type SafePaymentEventStage =
  | "challengeStarted"
  | "challengeEnded"
  | "redirectionStarted"
  | "redirectionEnded";

export type SafePaymentEvent = {
  stage: SafePaymentEventStage;
};

export type DropinOptions = ComponentOptions & {
  /**
   * Post-render notification. Errors are reported through `onError` but do not
   * reject `mount()` because the Nuvei widget has already been initialized.
   */
  onDropinReady?: () => Promise<void>;
  onPaymentEvent?: (event: SafePaymentEvent) => void;
};

export interface DropinComponent extends PaymentComponent {}

export interface PaymentDropinBuilder {
  dropinHasSubmit: boolean;
  build(config: DropinOptions): DropinComponent;
}

export interface PaymentExpressBuilder extends PaymentComponentBuilder {}

export type StoredComponentOptions = {
  showPayButton?: boolean;
  onPayButtonClick?: () => Promise<void>;
  id: string;
  brands: string[];
};

export interface StoredComponent extends PaymentComponent {
  remove(): Promise<void>;
}

export interface StoredComponentBuilder {
  componentHasSubmit: boolean;
  build(config: StoredComponentOptions): StoredComponent;
}

export type StoredPaymentMethod = {
  id: string;
  type: string;
  createdAt: string;
  isDefault: boolean;
  displayOptions: Record<string, unknown>;
};

export type StoredPaymentMethodsOptions = {
  allowedMethodTypes?: string[];
};

export type StoredPaymentMethodsResult = {
  storedPaymentMethods: StoredPaymentMethod[];
};
