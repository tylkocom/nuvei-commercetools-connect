/** Nuvei Web SDK loader (safecharge.js / window.SafeCharge). */

export type SafeChargeResult = {
  result: "APPROVED" | "DECLINED" | "PENDING" | "ERROR";
  transactionId?: string;
  errCode?: string | number;
  errorDescription?: string;
  cancelled?: boolean;
  redirectUrl?: string;
};

export type SafeChargeFieldEventName = "focus" | "blur" | "change" | "ready";

export type SafeChargeFieldEvent = {
  error?: { message?: string };
  complete?: boolean;
};

export interface SafeChargeCardField {
  attach(el: Element): void;
  /**
   * Optional Nuvei hosted-field event channel (focus/blur/change/ready).
   * Declared optional and feature-detected at the call site: not every SDK
   * build exposes it, and the exact payload must be verified against the
   * Nuvei sandbox before relying on it for production behavior.
   */
  on?(event: SafeChargeFieldEventName, handler: (event: SafeChargeFieldEvent) => void): void;
}

/** Style passed to scFields.create("card", { style }) to theme the iframe's inner text. */
export type SafeChargeFieldStyle = {
  base?: Record<string, string | Record<string, string>>;
  invalid?: Record<string, string>;
  empty?: Record<string, string>;
};

export type SafeChargeAlternativePaymentMethod = {
  alternativePaymentMethod: {
    paymentMethod: "apmgw_BLIK";
    blik_code: string;
  };
};

export type SafeChargePaymentOption = SafeChargeCardField | SafeChargeAlternativePaymentMethod;

export type SafeChargeCreatePaymentParams = {
  sessionToken: string;
  clientUniqueId?: string;
  merchant_unique_id?: string;
  merchantUniqueId?: string;
  merchantUniqueID?: string;
  cardHolderName?: string;
  paymentOption: SafeChargePaymentOption;
  billingAddress?: Record<string, string>;
  userDetails?: Record<string, string>;
  deviceDetails?: Record<string, string>;
  savePM?: boolean | "false" | "true";
};

export type SafeChargeApm = {
  paymentMethod: string;
  paymentMethodDisplayName?: Array<{ language: string; message: string }>;
  countries?: string[];
  currencies?: string[];
  logoURL?: string;
  fields?: Array<{ name: string; type: string; caption?: unknown[] }>;
};

export type SafeChargeGetApmsResult = {
  paymentMethods?: SafeChargeApm[];
  status?: string;
  errCode?: string | number;
  reason?: string;
};

export interface SafeChargeInstance {
  fields(opts: { fonts?: Array<{ cssUrl: string }> }): {
    create(type: "card", opts: object): SafeChargeCardField;
  };
  createPayment(
    params: SafeChargeCreatePaymentParams,
    callback: (res: SafeChargeResult) => void,
  ): void;
  getApms?(
    params: { currencyCode: string; countryCode: string; languageCode?: string },
    callback: (res: SafeChargeGetApmsResult) => void,
  ): void;
}

export type SafeChargeFactory = (opts: {
  env: "int" | "prod";
  merchantId: string;
  merchantSiteId: string;
}) => SafeChargeInstance;

export type SafeChargeLoaderOptions = Parameters<SafeChargeFactory>[0];

declare global {

  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }

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

  let resolve!: (value: SafeChargeInstance | PromiseLike<SafeChargeInstance>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<SafeChargeInstance>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  wsLoadPromise = promise.finally(() => {
    wsLoadPromise = undefined;
  });

  const existing = document.querySelector(
    `script[src="${WEB_SDK_URL}"]`,
  ) as HTMLScriptElement | null;

  if (existing) {
    const existingSafeCharge = window.SafeCharge as SafeChargeFactory | undefined;
    if (existingSafeCharge) {
      resolve(existingSafeCharge(opts));
      return wsLoadPromise;
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
    return wsLoadPromise;
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

  return wsLoadPromise;
}
