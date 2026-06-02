/** Nuvei Simply Connect SDK loader. */

/** @deprecated Use CheckoutResult for Simply Connect. Kept for api-service.ts compatibility. */
export type NuveiResult = CheckoutResult;

export interface CheckoutResult {
  transactionStatus: string;
  transactionId?: string;
  errCode?: number;
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
  env: "int" | "prod";
  merchantSiteId: string;
  merchantId: string;
  country?: string;
  locale?: string;
  currency?: string;
  amount?: number;
  fullName?: string;
  email?: string;
  billingAddress?: Record<string, string>;
  renderTo: string;
  onResult: (result: CheckoutResult) => void;
}) => void;

declare global {
  interface Window {
    checkout?: CheckoutFunction;
  }
}

export const NUVEI_SDK_URL =
  "https://cdn.safecharge.com/safecharge_resources/v1/checkout/checkout.js";

let sdkLoadPromise: Promise<CheckoutFunction> | undefined;

export function loadNuveiSdk(): Promise<CheckoutFunction> {
  if (window.checkout) {
    return Promise.resolve(window.checkout);
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise<CheckoutFunction>((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${NUVEI_SDK_URL}"]`,
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
    script.src = NUVEI_SDK_URL;
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
  });

  return sdkLoadPromise;
}
