/** Nuvei Web SDK loader (safecharge.js / window.SafeCharge). */

export type SafeChargeResult = {
  result: "APPROVED" | "DECLINED" | "PENDING" | "ERROR";
  transactionId?: string;
  errCode?: string | number;
  errorDescription?: string;
  cancelled?: boolean;
};

export interface SafeChargeCardField {
  attach(el: Element): void;
}

export interface SafeChargeInstance {
  fields(opts: { fonts?: Array<{ cssUrl: string }> }): {
    create(type: "card", opts: object): SafeChargeCardField;
  };
  createPayment(
    params: {
      sessionToken: string;
      clientUniqueId?: string;
      cardHolderName?: string;
      paymentOption: SafeChargeCardField;
      billingAddress?: Record<string, string>;
    },
    callback: (res: SafeChargeResult) => void,
  ): void;
}

export type SafeChargeFactory = (opts: {
  env: "int" | "prod";
  merchantId: string;
  merchantSiteId: string;
}) => SafeChargeInstance;

export type SafeChargeLoaderOptions = Parameters<SafeChargeFactory>[0];

declare global {
  interface Window {
    SafeCharge?: SafeChargeFactory;
  }
}

export const WEB_SDK_URL =
  "https://cdn.safecharge.com/safecharge_resources/v1/websdk/safecharge.js";

let wsLoadPromise: Promise<SafeChargeInstance> | undefined;

export function loadWebSdk(opts: SafeChargeLoaderOptions): Promise<SafeChargeInstance> {
  if (window.SafeCharge) {
    return Promise.resolve(window.SafeCharge(opts));
  }

  if (wsLoadPromise) {
    return wsLoadPromise;
  }

  wsLoadPromise = new Promise<SafeChargeInstance>((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${WEB_SDK_URL}"]`,
    ) as HTMLScriptElement | null;

    if (existing) {
      if (window.SafeCharge) {
        resolve(window.SafeCharge(opts));
        return;
      }

      existing.addEventListener(
        "load",
        () => {
          if (window.SafeCharge) {
            resolve(window.SafeCharge(opts));
          } else {
            reject(new Error("Nuvei SafeCharge factory not found after script load"));
          }
        },
        { once: true },
      );
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Nuvei Web SDK script")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = WEB_SDK_URL;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = () => {
      if (window.SafeCharge) {
        resolve(window.SafeCharge(opts));
        return;
      }
      reject(new Error("Nuvei SafeCharge factory not found after script load"));
    };
    script.onerror = () => reject(new Error("Failed to load Nuvei Web SDK script"));
    document.head.appendChild(script);
  }).finally(() => {
    wsLoadPromise = undefined;
  });

  return wsLoadPromise;
}
