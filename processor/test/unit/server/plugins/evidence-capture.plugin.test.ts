import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const configState = vi.hoisted(() => ({ evidenceCaptureToken: "" }));

vi.mock("../../../../src/config/config", () => ({
  config: configState,
  getConfig: () => configState,
}));

vi.mock("../../../../src/libs/logger/index", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import evidenceCapturePlugin from "../../../../src/server/plugins/evidence-capture.plugin";

const TOKEN = "evidence-token-1234567890";

async function buildServer(token: string) {
  configState.evidenceCaptureToken = token;
  const server = Fastify({ logger: false });
  await server.register(evidenceCapturePlugin);
  server.post("/webhooks/nuvei", async () => ({ status: "accepted" }));
  server.post("/payments/session", async () => ({
    paymentReference: "payment-1",
    cartId: "cart-1",
    sessionToken: "super-secret-session-token",
    amount: "10.00",
    currency: "EUR",
  }));
  return server;
}

describe("evidenceCapturePlugin", () => {
  afterEach(() => {
    configState.evidenceCaptureToken = "";
  });

  it("registers nothing when the token is unset", async () => {
    const server = await buildServer("");
    const response = await server.inject({ method: "GET", url: "/evidence/captures" });
    expect(response.statusCode).toBe(404);
  });

  it("stays disabled for short tokens", async () => {
    const server = await buildServer("short");
    const response = await server.inject({ method: "GET", url: "/evidence/captures" });
    expect(response.statusCode).toBe(404);
  });

  it("rejects missing or wrong bearer tokens", async () => {
    const server = await buildServer(TOKEN);
    const missing = await server.inject({ method: "GET", url: "/evidence/captures" });
    expect(missing.statusCode).toBe(401);

    const wrong = await server.inject({
      method: "GET",
      url: "/evidence/captures",
      headers: { authorization: "Bearer nope-nope-nope-nope" },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it("captures whitelisted DMN fields and never session tokens", async () => {
    const server = await buildServer(TOKEN);

    await server.inject({
      method: "POST",
      url: "/webhooks/nuvei",
      payload: {
        transactionType: "Auth",
        ppp_status: "OK",
        PPP_TransactionID: "711000123",
        merchant_unique_id: "payment-abc",
        clientUniqueId: "cart-abc",
        totalAmount: "10.00",
        currency: "EUR",
        advanceResponseChecksum: "deadbeef",
        email: "shopper@example.com",
      },
    });
    await server.inject({
      method: "POST",
      url: "/payments/session",
      payload: { paymentMethodOptions: { card: {} } },
    });

    const response = await server.inject({
      method: "GET",
      url: "/evidence/captures",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.count).toBe(2);

    const text = JSON.stringify(body);
    expect(text).not.toContain("super-secret-session-token");
    expect(text).not.toContain("deadbeef");
    expect(text).not.toContain("shopper@example.com");

    const dmnEntry = body.entries.find((entry: { route: string }) => entry.route === "/webhooks/nuvei");
    expect(dmnEntry.request).toEqual({
      transactionType: "Auth",
      ppp_status: "OK",
      PPP_TransactionID: "711000123",
      merchant_unique_id: "payment-abc",
      clientUniqueId: "cart-abc",
      totalAmount: "10.00",
      currency: "EUR",
    });

    const sessionEntry = body.entries.find(
      (entry: { route: string }) => entry.route === "/payments/session",
    );
    expect(sessionEntry.response).toEqual({
      paymentReference: "payment-1",
      cartId: "cart-1",
      amount: "10.00",
      currency: "EUR",
    });
  });

  it("clears the buffer on request and never captures its own routes", async () => {
    const server = await buildServer(TOKEN);

    await server.inject({ method: "POST", url: "/payments/session", payload: {} });
    await server.inject({
      method: "GET",
      url: "/evidence/captures",
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    const cleared = await server.inject({
      method: "POST",
      url: "/evidence/captures/clear",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(cleared.statusCode).toBe(200);

    const after = await server.inject({
      method: "GET",
      url: "/evidence/captures",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(after.json()).toEqual({ count: 0, entries: [] });
  });
});
