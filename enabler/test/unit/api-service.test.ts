import { describe, expect, it, vi, afterEach } from "vitest";
import { apiService, confirmPaymentResult, type ConfirmPaymentResponse } from "../../src/services/api-service";
import type { NuveiResult } from "../../src/services/simply-connect-sdk";

describe("apiService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gets processor config with the commercetools session header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          environment: "test",
          merchantId: "merchant-123",
          merchantSiteId: "site-456",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiService({
      baseApi: "https://processor.example.com/",
      sessionId: "session-123",
    }).getConfig();

    expect(result).toEqual({
      environment: "test",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://processor.example.com/operations/config", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Session-ID": "session-123",
      },
    });
  });

  // ---------------------------------------------------------------------------
  // createPayment
  // ---------------------------------------------------------------------------

  it("creates payments with method options", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          cartId: "cart-1",
          sessionToken: "session-1",
          paymentReference: "payment-1",
          merchantReturnUrl: "https://example.com/return",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiService({
      baseApi: "https://processor.example.com/",
      sessionId: "session-123",
    }).createPayment({ paymentMethodOptions: { card: {} } });

    expect(fetchMock).toHaveBeenCalledWith("https://processor.example.com/payments/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-ID": "session-123",
      },
      body: JSON.stringify({ paymentMethodOptions: { card: {} } }),
    });
  });

  it("createPayment sends an empty object body when no params are provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cartId: "cart", sessionToken: "st", paymentReference: "ref" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiService({ baseApi: "https://processor.example.com", sessionId: "s" }).createPayment();

    expect(fetchMock).toHaveBeenCalledWith("https://processor.example.com/payments/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-ID": "s" },
      body: JSON.stringify({}),
    });
  });

  it("createPayment throws a descriptive error on non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiService({ baseApi: "https://processor.example.com", sessionId: "s" }).createPayment(),
    ).rejects.toThrow("Failed to create payment session.");
  });

  // ---------------------------------------------------------------------------
  // confirmPayment
  // ---------------------------------------------------------------------------

  it("confirmPayment POSTs to /payments/confirm/:ref with correct body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ outcome: "approved" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiService({
      baseApi: "https://processor.example.com",
      sessionId: "session-123",
    }).confirmPayment({ sessionToken: "st-456", paymentReference: "ref-789" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://processor.example.com/payments/confirm/ref-789",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": "session-123",
        },
        body: JSON.stringify({ sessionToken: "st-456" }),
      },
    );
  });

  it("confirmPayment throws a descriptive error on non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiService({ baseApi: "https://processor.example.com", sessionId: "s" }).confirmPayment({
        sessionToken: "st",
        paymentReference: "ref",
      }),
    ).rejects.toThrow("Failed to confirm payment: 422 Unprocessable Entity");
  });

  it("confirmPayment returns { outcome: 'rejected' } for HTTP 402 with valid rejected body (D-05, D-07)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      statusText: "Payment Required",
      json: () => Promise.resolve({ outcome: "rejected" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiService({
      baseApi: "https://processor.example.com",
      sessionId: "s",
    }).confirmPayment({ sessionToken: "st", paymentReference: "ref" });

    expect(result).toEqual({ outcome: "rejected" });
  });

  it("confirmPayment throws for 402 with outcome other than 'rejected' (malformed 402)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      statusText: "Payment Required",
      json: () => Promise.resolve({ outcome: "approved" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiService({ baseApi: "https://processor.example.com", sessionId: "st" }).confirmPayment({
        sessionToken: "st",
        paymentReference: "ref",
      }),
    ).rejects.toThrow();
  });

  it("confirmPayment throws for 402 with missing outcome field (malformed 402)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      statusText: "Payment Required",
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiService({ baseApi: "https://processor.example.com", sessionId: "st" }).confirmPayment({
        sessionToken: "st",
        paymentReference: "ref",
      }),
    ).rejects.toThrow();
  });

  it("confirmPayment throws for HTTP 400 (technical/request failure, D-06)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () => Promise.resolve({ outcome: "rejected" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiService({ baseApi: "https://processor.example.com", sessionId: "st" }).confirmPayment({
        sessionToken: "st",
        paymentReference: "ref",
      }),
    ).rejects.toThrow();
  });

  it("confirmPayment throws for HTTP 500 (technical/system failure, D-06)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiService({ baseApi: "https://processor.example.com", sessionId: "st" }).confirmPayment({
        sessionToken: "st",
        paymentReference: "ref",
      }),
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Trailing slash normalisation
  // ---------------------------------------------------------------------------

  it("strips a trailing slash from baseApi so requests do not contain double slashes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cartId: "cart", sessionToken: "st", paymentReference: "ref" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiService({ baseApi: "https://processor.example.com/", sessionId: "s" }).createPayment();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://processor.example.com/payments/session",
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// confirmPaymentResult – callback routing and session-token handoff
// ---------------------------------------------------------------------------

describe("confirmPaymentResult", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeResult(transactionStatus = "APPROVED"): NuveiResult {
    return { transactionStatus, sessionToken: "browser-session-token" };
  }

  function makeApi(outcome: ConfirmPaymentResponse["outcome"]) {
    return {
      getConfig: vi.fn(),
      createPayment: vi.fn(),
      confirmPayment: vi.fn().mockResolvedValue({ outcome }),
    };
  }

  it("calls onComplete with approved result when processor outcome is approved (D-20)", async () => {
    const mockApi = makeApi("approved");
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onPending = vi.fn();

    await confirmPaymentResult(
      "ref-123",
      "known-session-token",
      mockApi,
      onComplete,
      onError,
      onPending,
    );

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith({
      isSuccess: true,
      paymentReference: "ref-123",
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onPending).not.toHaveBeenCalled();
  });

  it("routes rejected processor outcome through onComplete failure, not onError", async () => {
    const mockApi = makeApi("rejected");
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onPending = vi.fn();

    await confirmPaymentResult(
      "ref-123",
      "known-session-token",
      mockApi,
      onComplete,
      onError,
      onPending,
    );

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith({
      isSuccess: false,
      paymentReference: "ref-123",
    });
    expect(onPending).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("hands off to onPending immediately and does not retry when onPending is provided", async () => {
    const mockApi = makeApi("pending");
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onPending = vi.fn();

    await confirmPaymentResult(
      "ref-123",
      "known-session-token",
      mockApi,
      onComplete,
      onError,
      onPending,
      { retryDelaysMs: [0] },
    );

    // onPending present → immediate hand-off, no retry.
    expect(mockApi.confirmPayment).toHaveBeenCalledTimes(1);
    expect(onPending).toHaveBeenCalledOnce();
    expect(onPending).toHaveBeenCalledWith({ paymentReference: "ref-123" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("retries pending without onPending and resolves through onComplete on exhaustion", async () => {
    const mockApi = makeApi("pending");
    const onComplete = vi.fn();
    const onError = vi.fn();
    // No onPending — triggers bounded retry with default delays.

    await confirmPaymentResult(
      "ref-123",
      "known-session-token",
      mockApi,
      onComplete,
      onError,
      undefined,
      { retryDelaysMs: [0, 0, 0, 0, 0] },
    );

    // 1 initial + 5 retries = 6 calls total.
    expect(mockApi.confirmPayment).toHaveBeenCalledTimes(6);
    // Exhausted pending resolves through onComplete, NOT onError.
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith({
      isSuccess: false,
      paymentReference: "ref-123",
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("retries pending without onPending and resolves when processor eventually approves", async () => {
    const mockApi = {
      getConfig: vi.fn(),
      createPayment: vi.fn(),
      confirmPayment: vi
        .fn()
        .mockResolvedValueOnce({ outcome: "pending" })
        .mockResolvedValueOnce({ outcome: "approved" }),
    };
    const onComplete = vi.fn();
    const onError = vi.fn();
    // No onPending — triggers retry.

    await confirmPaymentResult(
      "ref-123",
      "known-session-token",
      mockApi,
      onComplete,
      onError,
      undefined,
      { retryDelaysMs: [0] },
    );

    expect(mockApi.confirmPayment).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith({
      isSuccess: true,
      paymentReference: "ref-123",
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not leak session token when processor call throws (D-21 safe error path)", async () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onPending = vi.fn();
    const mockApi = {
      getConfig: vi.fn(),
      createPayment: vi.fn(),
      confirmPayment: vi.fn().mockRejectedValue(new Error("backend secret-token failed")),
    };

    await confirmPaymentResult(
      "ref-123",
      "known-session-token",
      mockApi,
      onComplete,
      onError,
      onPending,
    );

    expect(onComplete).not.toHaveBeenCalled();
    expect(onPending).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    const error = onError.mock.calls[0][0] as Error;
    expect(error.message).not.toContain("secret-token");
  });
});
