/** Nuvei Simply Connect SDK loader (checkout.js / window.checkout). */

/** @deprecated Use CheckoutResult. */
export type NuveiResult = CheckoutResult;

export interface CheckoutResult {
  transactionStatus: string;
  transactionId?: string;
  errCode?: number | string;
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

export type PrePaymentControls = {
  resolve: () => void;
  reject: (reason?: string) => void;
};

export type PrePaymentCallback = (
  controlsOrResolve: PrePaymentControls | (() => void),
  reject?: (reason?: string) => void,
) => void;

export type CheckoutConfig = {
  sessionToken: string;
  merchant_unique_id?: string;
  merchantUniqueId?: string;
  merchantUniqueID?: string;
  env: "int" | "prod";
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
  onResult: (result: CheckoutResult) => void;
  onError?: (error: unknown) => void;
  onPending?: (result?: CheckoutResult) => void;
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
