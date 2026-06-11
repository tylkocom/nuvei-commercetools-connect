import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fastify/autoload", () => ({
  default: async () => {},
}));

const paymentService = {
  config: vi.fn(),
  status: vi.fn(),
  health: vi.fn(),
  getSupportedPaymentComponents: vi.fn(),
  modifyPayment: vi.fn(),
  handleTransaction: vi.fn(),
};

vi.mock("../../../src/payment-sdk", () => ({
  paymentSDK: {
    sessionHeaderAuthHookFn: { authenticate: vi.fn(() => async () => {}) },
    jwtAuthHookFn: { authenticate: vi.fn(() => async () => {}) },
    oauth2AuthHookFn: { authenticate: vi.fn(() => async () => {}) },
    authorityAuthorizationHookFn: { authorize: vi.fn(() => async () => {}) },
  },
}));

vi.mock("../../../src/server/app", () => ({
  app: {
    services: {
      paymentService,
    },
  },
}));

vi.mock("../../../src/config/config", () => ({
  config: {
    projectKey: "test-project",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    authUrl: "https://auth.europe-west1.gcp.commercetools.com",
    apiUrl: "https://api.europe-west1.gcp.commercetools.com",
    sessionUrl: "https://session.europe-west1.gcp.commercetools.com",
    checkoutUrl: "https://checkout.europe-west1.gcp.commercetools.com",
    jwksUrl: "https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json",
    jwtIssuer: "https://mc-api.europe-west1.gcp.commercetools.com",
    loggerLevel: "silent",
    nuveiEnv: "test",
    nuveiMerchantId: "test-merchant",
    nuveiMerchantSiteId: "test-site",
    nuveiSecretKey: "test-secret",
    nuveiApiBaseUrl: "https://test.nuvei.com",
    serviceUrl: "",
    port: 8080,
    returnUrl: "",
    corsAllowedOrigins: ["https://allowed.example.com"],
    buildCommit: "test-commit",
    phase02StageALocalMockCt: false,
  },
  getConfig: () => ({
    projectKey: "test-project",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    authUrl: "https://auth.europe-west1.gcp.commercetools.com",
    apiUrl: "https://api.europe-west1.gcp.commercetools.com",
    sessionUrl: "https://session.europe-west1.gcp.commercetools.com",
    checkoutUrl: "https://checkout.europe-west1.gcp.commercetools.com",
    jwksUrl: "https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json",
    jwtIssuer: "https://mc-api.europe-west1.gcp.commercetools.com",
    loggerLevel: "silent",
    nuveiEnv: "test",
    nuveiMerchantId: "test-merchant",
    nuveiMerchantSiteId: "test-site",
    nuveiSecretKey: "test-secret",
    nuveiApiBaseUrl: "https://test.nuvei.com",
    serviceUrl: "",
    port: 8080,
    returnUrl: "",
    corsAllowedOrigins: [],
    buildCommit: "test-commit",
    phase02StageALocalMockCt: false,
  }),
}));
vi.mock("../../../src/libs/fastify/context/context", () => ({
  requestContextPlugin: async () => {},
  getRequestContext: vi.fn(),
  updateRequestContext: vi.fn(),
}));

import { setupFastify } from "../../../src/server/server";

describe("setupFastify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a working fastify instance", async () => {
    const server = await setupFastify();

    // Register a simple route for testing
    server.get("/test", async () => ({ ok: true }));

    const response = await server.inject({
      method: "GET",
      url: "/test",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("grants CORS headers to allowlisted origins", async () => {
    const server = await setupFastify();

    server.get("/config", async () => ({ environment: "test" }));

    const response = await server.inject({
      method: "GET",
      url: "/config",
      headers: {
        origin: "https://allowed.example.com",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://allowed.example.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.json()).toEqual({ environment: "test" });
  });

  it("does not grant CORS headers to unknown origins", async () => {
    const server = await setupFastify();

    server.get("/config", async () => ({ environment: "test" }));

    const response = await server.inject({
      method: "GET",
      url: "/config",
      headers: {
        origin: "https://evil.example.com",
      },
    });

    // The request itself is served (CORS is a browser-side gate), but no
    // Access-Control-Allow-Origin is granted, so browsers block the response.
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    // allow-credentials may still be emitted; without an ACAO grant it is inert.
  });

  it("answers preflight for allowlisted origins with reflected request headers", async () => {
    const server = await setupFastify();

    server.post("/payments/session", async () => ({ ok: true }));

    const response = await server.inject({
      method: "OPTIONS",
      url: "/payments/session",
      headers: {
        origin: "https://allowed.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-session-id",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://allowed.example.com");
    expect(response.headers["access-control-allow-headers"]).toBe("content-type,x-session-id");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("answers preflight for unknown origins without a grant instead of 404", async () => {
    const server = await setupFastify();

    server.post("/payments/session", async () => ({ ok: true }));

    const response = await server.inject({
      method: "OPTIONS",
      url: "/payments/session",
      headers: {
        origin: "https://evil.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-session-id",
      },
    });

    // A 404 here breaks browser error reporting; the boundary is the missing ACAO grant.
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("always allows the configured commercetools Checkout origin", async () => {
    const server = await setupFastify();

    server.get("/config", async () => ({ environment: "test" }));

    const response = await server.inject({
      method: "GET",
      url: "/config",
      headers: {
        origin: "https://checkout.europe-west1.gcp.commercetools.com",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://checkout.europe-west1.gcp.commercetools.com",
    );
  });

  it("sets defensive security headers on responses", async () => {
    const server = await setupFastify();

    server.get("/test", async () => ({ ok: true }));

    const response = await server.inject({ method: "GET", url: "/test" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["permissions-policy"]).toContain("camera=()");
  });
});
