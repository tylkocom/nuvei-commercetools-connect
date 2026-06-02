import { describe, expect, it, vi, afterEach } from "vitest";
import { apiService } from "../../src/services/api-service";

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
      json: () => Promise.resolve({ outcome: "confirmed" }),
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
