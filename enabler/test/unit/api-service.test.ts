import { describe, expect, it, vi, afterEach } from "vitest";
import { apiService, confirmPaymentResult } from "../../src/services/api-service";
import type { NuveiResult } from "../../src/services/nuvei-sdk";

describe("apiService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    await apiService({ baseApi: "https://processor.example.com/", sessionId: "session-123" })
      .createPayment({ paymentMethodOptions: { card: {} } });

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

    await apiService({ baseApi: "https://processor.example.com", sessionId: "s" })
      .createPayment();

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

    await apiService({ baseApi: "https://processor.example.com", sessionId: "session-123" })
      .confirmPayment({ sessionToken: "st-456", paymentReference: "ref-789" });

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
      apiService({ baseApi: "https://processor.example.com", sessionId: "s" })
        .confirmPayment({ sessionToken: "st", paymentReference: "ref" }),
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

    const result = await apiService({ baseApi: "https://processor.example.com", sessionId: "s" })
      .confirmPayment({ sessionToken: "st", paymentReference: "ref" });

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
      apiService({ baseApi: "https://processor.example.com", sessionId: "s" })
        .confirmPayment({ sessionToken: "st", paymentReference: "ref" }),
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
      apiService({ baseApi: "https://processor.example.com", sessionId: "s" })
        .confirmPayment({ sessionToken: "st", paymentReference: "ref" }),
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
      apiService({ baseApi: "https://processor.example.com", sessionId: "s" })
        .confirmPayment({ sessionToken: "st", paymentReference: "ref" }),
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
      apiService({ baseApi: "https://processor.example.com", sessionId: "s" })
        .confirmPayment({ sessionToken: "st", paymentReference: "ref" }),
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

    await apiService({ baseApi: "https://processor.example.com/", sessionId: "s" })
      .createPayment();

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

  function makeApi(outcome: string) {
    return {
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
      makeResult("APPROVED"),
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
      sessionToken: "known-session-token",
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onPending).not.toHaveBeenCalled();
  });

  it("calls safe onError and not onComplete or onPending when processor outcome is rejected (D-21)", async () => {
    const mockApi = makeApi("rejected");
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onPending = vi.fn();

    await confirmPaymentResult(
      makeResult("APPROVED"),
      "ref-123",
      "known-session-token",
      mockApi,
      onComplete,
      onError,
      onPending,
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onPending).not.toHaveBeenCalled();
    // Error must be safe: must not leak session token or raw Nuvei details
    const [err] = onError.mock.calls[0] as [Error];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain("known-session-token");
    expect(err.message).not.toContain("browser-session-token");
  });

  it("calls optional onPending and not onComplete or onError when processor outcome is pending (D-19, D-22)", async () => {
    const mockApi = makeApi("pending");
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onPending = vi.fn();

    await confirmPaymentResult(
      makeResult("APPROVED"),
      "ref-123",
      "known-session-token",
      mockApi,
      onComplete,
      onError,
      onPending,
    );

    expect(onPending).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not throw when onPending is absent and processor outcome is pending (D-19)", async () => {
    const mockApi = makeApi("pending");
    const onComplete = vi.fn();
    const onError = vi.fn();

    await expect(
      confirmPaymentResult(
        makeResult("APPROVED"),
        "ref-123",
        "known-session-token",
        mockApi,
        onComplete,
        onError,
        // onPending intentionally omitted
      ),
    ).resolves.toBeUndefined();

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("uses knownSessionToken (not result.sessionToken) for the confirmPayment call (D-11)", async () => {
    const mockApi = makeApi("approved");

    await confirmPaymentResult(
      { transactionStatus: "APPROVED", sessionToken: "browser-session-token" },
      "ref-123",
      "known-session-token",
      mockApi,
      vi.fn(),
      vi.fn(),
    );

    expect(mockApi.confirmPayment).toHaveBeenCalledWith({
      sessionToken: "known-session-token",
      paymentReference: "ref-123",
    });
    // Must NOT use browser result sessionToken
    expect(mockApi.confirmPayment).not.toHaveBeenCalledWith(
      expect.objectContaining({ sessionToken: "browser-session-token" }),
    );
  });

  it("browser SDK transactionStatus does not independently gate onComplete without approved processor outcome (D-04)", async () => {
    // Processor returns rejected even though browser says APPROVED
    const mockApi = makeApi("rejected");
    const onComplete = vi.fn();
    const onError = vi.fn();

    await confirmPaymentResult(
      makeResult("APPROVED"), // browser says approved
      "ref-123",
      "known-session-token",
      mockApi,
      onComplete,
      onError,
    );

    // Processor outcome wins – onComplete must NOT be called
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });
});
