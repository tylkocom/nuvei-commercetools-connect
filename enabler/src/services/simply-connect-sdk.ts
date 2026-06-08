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

export type CheckoutFunction = (config: {
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
  onResult: (result: CheckoutResult) => void;
  onError?: (error: unknown) => void;
  onPending?: (result?: CheckoutResult) => void;
}) => void;

declare global {
  interface Window {
    checkout?: CheckoutFunction;
  }
}

export const SIMPLY_CONNECT_SDK_URL =
  "https://cdn.safecharge.com/safecharge_resources/v1/checkout/checkout.js";

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
      existing.addEventListener("load", () => resolve(window.checkout!));
      existing.addEventListener("error", () => reject(new Error("Failed to load Nuvei SDK")));
      return;
    }

    const script = document.createElement("script");
    script.src = SIMPLY_CONNECT_SDK_URL;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = () => {
      if (window.checkout) {
        resolve(window.checkout);
      } else {
        reject(new Error("Nuvei checkout function not found after script load"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load Nuvei SDK script"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scLoadPromise = undefined;
    throw error;
  });

  return scLoadPromise;
}
