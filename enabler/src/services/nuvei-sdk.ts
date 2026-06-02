/** Nuvei SafeCharge Web SDK loader shared by drop-in and component integrations. */

export type SafeChargeFactory = (config: {
  env: "int" | "prod";
  merchantId: string;
  merchantSiteId: string;
  locale?: string;
}) => {
  createPayment: (options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    SafeCharge?: SafeChargeFactory;
  }
}

export interface NuveiResult {
  transactionStatus: string;
  sessionToken: string;
  errCode?: number;
  reason?: string;
}

export const NUVEI_SDK_URL =
  "https://cdn.safecharge.com/safecharge_resources/v1/websdk/safecharge.js";
export const NUVEI_SDK_INTEGRITY =
  "sha384-S5b4DOR5dVcXV9iTeCds2A4KbxfU7z9yv7cMfJA76JlXu9wnrgM7IqFstB7lT8Gv";

let sdkLoadPromise: Promise<SafeChargeFactory> | undefined;

export function loadNuveiSdk(): Promise<SafeChargeFactory> {
  if (window.SafeCharge) {
    return Promise.resolve(window.SafeCharge);
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise<SafeChargeFactory>((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${NUVEI_SDK_URL}"]`,
    ) as HTMLScriptElement | null;

    if (existing) {
      if (window.SafeCharge) {
        resolve(window.SafeCharge);
        return;
      }
      existing.addEventListener("load", () => resolve(window.SafeCharge!));
      existing.addEventListener("error", () => reject(new Error("Failed to load Nuvei SDK")));
      return;
    }

    const script = document.createElement("script");
    script.src = NUVEI_SDK_URL;
    script.integrity = NUVEI_SDK_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = () => {
      if (window.SafeCharge) {
        resolve(window.SafeCharge);
      } else {
        reject(new Error("Nuvei SafeCharge SDK not found after script load"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load Nuvei SDK script"));
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}
