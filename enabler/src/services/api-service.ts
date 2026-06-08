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

/** Shape of the response returned by `GET /operations/config`. */
export type ProcessorConfigResponse = {
  environment: "test" | "production" | string;
  merchantId: string;
  merchantSiteId: string;
};

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
  getConfig: () => Promise<ProcessorConfigResponse>;
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

const DEFAULT_CONFIRM_PAYMENT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 8_000] as const;

export type ConfirmPaymentPollingOptions = {
  retryDelaysMs?: readonly number[];
  wait?: (delayMs: number) => Promise<void>;
};

function waitForNextConfirmAttempt(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}

/**
 * Confirms a payment via the processor and routes to the appropriate merchant
 * callback based on the authoritative processor outcome.
 *
 * The processor response is the single source of truth. Pending outcomes are
 * observed via `onPending` and polled to a bounded terminal result. Business
 * rejections are reported through `onComplete({ isSuccess: false })` for
 * Checkout-template compatibility; `onError` is reserved for technical failures.
 */
export async function confirmPaymentResult(
  paymentReference: string,
  knownSessionToken: string,
  api: Pick<ApiService, "confirmPayment">,
  onComplete?: (result: PaymentResult) => void,
  onError?: (error: unknown, context?: { paymentReference?: string }) => void,
  onPending?: (result: PendingPaymentResult) => void,
  pollingOptions: ConfirmPaymentPollingOptions = {},
): Promise<void> {
  const retryDelaysMs = pollingOptions.retryDelaysMs ?? DEFAULT_CONFIRM_PAYMENT_RETRY_DELAYS_MS;
  const wait = pollingOptions.wait ?? waitForNextConfirmAttempt;

  for (let attempt = 0; ; attempt += 1) {
    let confirmRes: ConfirmPaymentResponse;
    try {
      confirmRes = await api.confirmPayment({ sessionToken: knownSessionToken, paymentReference });
    } catch {
      onError?.(new Error("Failed to confirm payment."), { paymentReference });
      return;
    }

    switch (confirmRes.outcome) {
      case "approved":
        onComplete?.({
          isSuccess: true,
          paymentReference,
        });
        return;

      case "rejected":
        onComplete?.({
          isSuccess: false,
          paymentReference,
        });
        return;

      case "pending":
        onPending?.({ paymentReference });
        const retryDelayMs = retryDelaysMs[attempt];
        if (retryDelayMs !== undefined) {
          await wait(retryDelayMs);
          continue;
        }
        onError?.(new Error("Payment confirmation is still pending. Please wait for final payment status."), {
          paymentReference,
        });
        return;
    }
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

function readJsonOrThrow<T>(res: Response, route: string): Promise<T> {
  if (!res.ok) {
    throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, `Failed to call ${route}.`, {
      route,
      status: res.status,
    });
  }
  return res.json() as Promise<T>;
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
    async getConfig(): Promise<ProcessorConfigResponse> {
      const res = await fetch(`${baseApi}/operations/config`, {
        method: "GET",
        headers,
      });
      return readJsonOrThrow<ProcessorConfigResponse>(res, "GET /operations/config");
    },

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
      const res = await fetch(`${baseApi}/payments/confirm/${params.paymentReference}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ sessionToken: params.sessionToken }),
      });

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
