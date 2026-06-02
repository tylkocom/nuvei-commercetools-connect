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
  type PublicPaymentError,
} from "../payment-enabler/payment-enabler.js";
import type { NuveiResult } from "./nuvei-sdk.js";

/** Shape of the response returned by `POST /payments/session`. */
export type PaymentSessionResponse = {
  cartId: string;
  sessionToken: string;
  paymentReference: string;
  merchantReturnUrl?: string;
};

/** Shape of the response returned by `POST /payments/confirm/:ref`. */
export type ConfirmPaymentResponse = {
  outcome: string;
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
 * Confirms a payment via the processor after the Nuvei widget reports
 * approval. Shared by all enabler component types.
 */
export async function confirmPaymentResult(
  result: NuveiResult,
  paymentReference: string,
  api: ApiService,
  onComplete?: (result: PaymentResult) => void,
  onError?: (error: unknown) => void,
): Promise<void> {
  if (result.transactionStatus !== "APPROVED") {
    onError?.(new Error(result.reason || `Payment failed (status: ${result.transactionStatus})`));
    return;
  }

  try {
    await api.confirmPayment({ sessionToken: result.sessionToken, paymentReference });
    onComplete?.({
      isSuccess: true,
      paymentReference,
      sessionToken: result.sessionToken,
    });
  } catch (error) {
    onError?.(error);
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
      if (!res.ok) {
        throw new Error(`Failed to confirm payment: ${res.status} ${res.statusText}`);
      }
      return res.json();
    },
  };
}
