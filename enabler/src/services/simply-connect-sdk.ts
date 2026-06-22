/** Nuvei Simply Connect SDK loader (checkout.js / window.checkout). */

/** @deprecated Use CheckoutResult. */
export type NuveiResult = CheckoutResult;

/**
 * Result object Nuvei passes to `onResult`. Verified against Simply Connect v1
 * `checkout.js`: the status is NOT consistently carried by a single field — Nuvei
 * may populate `transactionStatus`, `status`, or `result` depending on the path
 * (card auth vs. APM vs. error). Error detail arrives as `errorDescription`
 * and/or `reason`. Any field may be absent on a given call, so every field is
 * optional. The enabler treats the processor (not this object) as the source of
 * truth for the final outcome; it only reads `cancelled` directly.
 */
export interface CheckoutResult {
  transactionStatus?: string;
  status?: string;
  result?: string;
  transactionId?: string;
  errCode?: number | string;
  errorDescription?: string;
  reason?: string;
  sessionToken?: string;
  userPaymentOptionId?: string;
  ccCardNumber?: string;
  bin?: string;
  last4Digits?: string;
  ccExpMonth?: string;
  ccExpYear?: string;
  cancelled?: boolean;
}

export type SimplyConnectPaymentEvent = string | Record<string, unknown>;

/**
 * Payload Nuvei passes to `prePayment`. Shape verified against Simply Connect v1
 * `checkout.js`: Nuvei builds a single object carrying the masked card / payment
 * option, then chains `.then()` on the callback's return value.
 *
 * SECURITY: this object carries masked cardholder data (e.g. `ccCardNumber` is
 * `bin****last4`, plus name, bin, expiry). Per project policy it MUST NOT be
 * logged, forwarded to the processor, or surfaced to Checkout. The enabler reads
 * none of these fields — it only awaits Checkout's `onPayButtonClick` gate and
 * returns a boolean.
 */
export type PrePaymentPayload = {
  paymentOption?: {
    card?: Record<string, unknown>;
    alternativePaymentMethod?: Record<string, unknown>;
    upo?: Record<string, unknown>;
  };
  savePM?: boolean;
  amount?: string | number;
  currency?: string;
};

/**
 * Verified Simply Connect `prePayment` contract: Nuvei invokes the callback with
 * a single payload object and expects a Promise in return.
 * - Resolve to anything other than literal `false` -> Nuvei proceeds with authorization.
 * - Resolve to exactly `false` -> Nuvei aborts the payment.
 * - Reject the promise -> Nuvei aborts and treats the rejection reason as the error.
 */
export type PrePaymentCallback = (payload: PrePaymentPayload) => Promise<boolean | void>;

export type CheckoutConfig = {
  sessionToken: string;
  env: "int" | "prod" | "test" | "qa";
  merchantSiteId: string;
  merchantId: string;
  country?: string;
  locale?: string;
  currency?: string;
  amount?: number | string;
  fullName?: string;
  email?: string;
  billingAddress?: Record<string, string>;
  renderTo: string;
  pmWhitelist?: readonly string[];
  prePayment?: PrePaymentCallback;
  /**
   * Fired by Simply Connect once the widget has rendered
   * (`onReady?.({loaded:true})` in checkout.js). This is the real post-render
   * readiness signal — the enabler uses it to drive `onDropinReady`.
   */
  onReady?: (payload?: { loaded?: boolean }) => void;
  onResult: (result: CheckoutResult) => void;
  onError?: (error: unknown) => void;
  onPaymentEvent?: (event: SimplyConnectPaymentEvent) => void;
};

export type CheckoutFunction = (config: CheckoutConfig) => void;

declare global {
  interface Window {
    checkout?: CheckoutFunction;
  }
}

export const SIMPLY_CONNECT_SDK_URL =
  "https://cdn.safecharge.com/safecharge_resources/v1/checkout/checkout.js";
export const SIMPLY_CONNECT_SDK_LOAD_TIMEOUT_MS = 10_000;

function rejectWithLoadFailure(
  reject: (reason?: unknown) => void,
  script: HTMLScriptElement,
  message: string,
): void {
  script.remove?.();
  reject(new Error(message));
}

type SdkLoadGuards = {
  settle: (checkout: CheckoutFunction) => void;
  fail: (message: string) => void;
};

function createSdkLoadGuards(
  script: HTMLScriptElement,
  resolve: (checkout: CheckoutFunction) => void,
  reject: (reason?: unknown) => void,
  cleanupListeners: () => void = () => undefined,
): SdkLoadGuards {
  let settled = false;
  let timeout: ReturnType<typeof setTimeout>;
  const cleanup = () => {
    clearTimeout(timeout);
    cleanupListeners();
  };

  timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectWithLoadFailure(reject, script, "Timed out loading Nuvei SDK script");
  }, SIMPLY_CONNECT_SDK_LOAD_TIMEOUT_MS);

  return {
    settle(checkout: CheckoutFunction) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(checkout);
    },
    fail(message: string) {
      if (settled) return;
      settled = true;
      cleanup();
      rejectWithLoadFailure(reject, script, message);
    },
  };
}

let scLoadPromise: Promise<CheckoutFunction> | undefined;

export function loadSimplyConnectSdk(): Promise<CheckoutFunction> {
  if (window.checkout) {
    return Promise.resolve(window.checkout);
  }

  if (scLoadPromise) {
    return scLoadPromise;
  }

  scLoadPromise = new Promise<CheckoutFunction>((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${SIMPLY_CONNECT_SDK_URL}"]`,
    ) as HTMLScriptElement | null;

    if (existing) {
      if (window.checkout) {
        resolve(window.checkout);
        return;
      }

      const listeners: { load?: () => void; error?: () => void } = {};
      const guards = createSdkLoadGuards(existing, resolve, reject, () => {
        if (listeners.load) existing.removeEventListener?.("load", listeners.load);
        if (listeners.error) existing.removeEventListener?.("error", listeners.error);
      });
      listeners.load = () => {
        if (window.checkout) {
          guards.settle(window.checkout);
        } else {
          guards.fail("Nuvei checkout function not found after script load");
        }
      };
      listeners.error = () => {
        guards.fail("Failed to load Nuvei SDK");
      };

      existing.addEventListener("load", listeners.load);
      existing.addEventListener("error", listeners.error);
      return;
    }

    const script = document.createElement("script");
    script.src = SIMPLY_CONNECT_SDK_URL;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";

    const guards = createSdkLoadGuards(script, resolve, reject);
    script.onload = () => {
      if (window.checkout) {
        guards.settle(window.checkout);
      } else {
        guards.fail("Nuvei checkout function not found after script load");
      }
    };
    script.onerror = () => {
      guards.fail("Failed to load Nuvei SDK script");
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scLoadPromise = undefined;
    throw error;
  });

  return scLoadPromise;
}
