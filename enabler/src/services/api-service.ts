/**
 * API service – thin fetch wrapper around the Nuvei processor backend.
 *
 * Every request carries the commercetools session ID so the processor can
 * correlate the call with the correct cart / payment.
 */

import type { PaymentResult } from "../payment-enabler/payment-enabler.js";
import type { NuveiResult } from "./nuvei-sdk.js";

/** Shape of the response returned by `POST /payments`. */
export type PaymentSessionResponse = {
  sessionToken: string;
  paymentReference: string;
  merchantReturnUrl?: string;
};

/** Shape of the response returned by `POST /payments/confirmPayments/:ref`. */
export type ConfirmPaymentResponse = {
  outcome: string;
};

/** Public contract exposed to consuming code. */
export type ApiService = {
  createPayment: (opts?: CreatePaymentRequest) => Promise<PaymentSessionResponse>;
  getPayment: () => Promise<PaymentSessionResponse>;
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
      const res = await fetch(`${baseApi}/payments`, {
        method: "POST",
        headers,
        body: JSON.stringify(params ?? {}),
      });
      if (!res.ok) {
        throw new Error(`Failed to create payment: ${res.status} ${res.statusText}`);
      }
      return res.json();
    },

    async getPayment(): Promise<PaymentSessionResponse> {
      const res = await fetch(`${baseApi}/payments`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to get payment: ${res.status} ${res.statusText}`);
      }
      return res.json();
    },

    async confirmPayment(params: ConfirmPaymentRequest): Promise<ConfirmPaymentResponse> {
      const res = await fetch(
        `${baseApi}/payments/confirmPayments/${params.paymentReference}`,
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
