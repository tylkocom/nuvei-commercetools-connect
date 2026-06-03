/**
 * API service – thin fetch wrapper around the Nuvei processor backend.
 *
 * Every request carries the commercetools session ID so the processor can
 * correlate the call with the correct cart / payment.
 */

import {
  PaymentSetupError,
  PublicPaymentErrorCode,
  type PaymentResult,
  type PendingPaymentResult,
  type PublicPaymentError,
} from "../payment-enabler/payment-enabler.js";
import type { NuveiResult } from "./simply-connect-sdk.js";

/** Shape of the response returned by `POST /payments/session`. */
export type PaymentSessionResponse = {
  cartId: string;
  sessionToken: string;
  paymentReference: string;
  merchantReturnUrl?: string;
  amount: string;
  currency: string;
};

/**
 * Shape of the response returned by `POST /payments/confirm/:ref`.
 *
 * HTTP 200 carries `approved` or `pending`.
 * HTTP 402 carries `rejected` and is parsed as a valid business outcome (D-05, D-07).
 */
export type ConfirmPaymentResponse = {
  outcome: "approved" | "rejected" | "pending";
};

/** Public contract exposed to consuming code. */
export type ApiService = {
  createPayment: (opts?: CreatePaymentRequest) => Promise<PaymentSessionResponse>;
  confirmPayment: (opts: ConfirmPaymentRequest) => Promise<ConfirmPaymentResponse>;
};

export type CreatePaymentRequest = {
  paymentMethodOptions?: Record<string, Record<string, unknown>>;
};

/** Parameters for the confirm-payment call. */
export type ConfirmPaymentRequest = {
  sessionToken: string;
  paymentReference: string;
};

/**
 * Confirms a payment via the processor and routes to the appropriate merchant
 * callback based on the authoritative processor outcome.
 *
 * The processor response is the single source of truth:
 * - `approved` → onComplete (D-20)
 * - `rejected` → safe onError; does not call onComplete or onPending (D-21)
 * - `pending`  → optional onPending; does not call onComplete or onError (D-19, D-22)
 *
 * @param result           - Nuvei browser widget result (used for reference only)
 * @param paymentReference - CT Payment id used as the confirmation endpoint path
 * @param knownSessionToken - Session token from the processor createPayment response (D-11)
 *                           Must NOT be taken from `result.sessionToken` (browser-side value)
 * @param api              - API service bound to the processor backend
 * @param onComplete       - Called on approved outcome
 * @param onError          - Called on rejected outcome with a safe error
 * @param onPending        - Called on pending outcome (optional; no polling added)
 */
export async function confirmPaymentResult(
  result: NuveiResult,
  paymentReference: string,
  knownSessionToken: string,
  api: ApiService,
  onComplete?: (result: PaymentResult) => void,
  onError?: (error: unknown) => void,
  onPending?: (result: PendingPaymentResult) => void,
): Promise<void> {
  let confirmRes: ConfirmPaymentResponse;
  try {
    confirmRes = await api.confirmPayment({ sessionToken: knownSessionToken, paymentReference });
  } catch {
    onError?.(new Error("Failed to confirm payment."));
    return;
  }

  switch (confirmRes.outcome) {
    case "approved":
      onComplete?.({
        isSuccess: true,
        paymentReference,
        sessionToken: knownSessionToken,
      });
      break;

    case "rejected":
      // Safe error — do not expose session token, raw Nuvei data, or diagnostics (T-01.1.1-08)
      onError?.(
        new PaymentSetupError(
          PublicPaymentErrorCode.REQUEST_MALFORMED,
          "Payment was declined. Please try a different payment method.",
        ),
      );
      break;

    case "pending":
      onPending?.({ paymentReference, sessionToken: knownSessionToken });
      break;
  }
}

async function readPublicPaymentError(res: Response): Promise<PublicPaymentError | undefined> {
  try {
    const body = (await res.json()) as Partial<PublicPaymentError>;
    if (typeof body.code === "string" && typeof body.message === "string") {
      return { code: body.code as PublicPaymentErrorCode, message: body.message };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Creates an {@link ApiService} bound to a processor URL and session.
 */
export function apiService(opts: { baseApi: string; sessionId: string }): ApiService {
  const baseApi = opts.baseApi.replace(/\/$/, "");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Session-ID": opts.sessionId,
  };

  return {
    async createPayment(params?: CreatePaymentRequest): Promise<PaymentSessionResponse> {
      const res = await fetch(`${baseApi}/payments/session`, {
        method: "POST",
        headers,
        body: JSON.stringify(params ?? {}),
      });
      if (!res.ok) {
        const publicError = await readPublicPaymentError(res);
        if (publicError) {
          throw new PaymentSetupError(publicError.code, publicError.message, {
            route: "POST /payments/session",
            status: res.status,
          });
        }
        throw new PaymentSetupError(
          PublicPaymentErrorCode.REQUEST_MALFORMED,
          "Failed to create payment session.",
          { route: "POST /payments/session", status: res.status },
        );
      }
      return res.json();
    },

    async confirmPayment(params: ConfirmPaymentRequest): Promise<ConfirmPaymentResponse> {
      const res = await fetch(
        `${baseApi}/payments/confirm/${params.paymentReference}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ sessionToken: params.sessionToken }),
        },
      );

      // HTTP 402 with outcome === "rejected" is a valid business outcome (D-05, D-07).
      // All other non-ok responses are technical/request failures.
      if (res.status === 402) {
        const body = (await res.json()) as Partial<ConfirmPaymentResponse>;
        if (body.outcome === "rejected") {
          return { outcome: "rejected" };
        }
        throw new Error(
          `Failed to confirm payment: malformed 402 response (outcome: ${String(body.outcome)})`,
        );
      }

      if (!res.ok) {
        throw new Error(`Failed to confirm payment: ${res.status} ${res.statusText}`);
      }

      return res.json();
    },
  };
}
