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
    corsAllowedOrigins: [],
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

  it("creates a fastify instance with permissive CORS handling", async () => {
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

  it("allows any origin without CORS restrictions", async () => {
    const server = await setupFastify();

    server.get("/config", async () => ({ environment: "test" }));

    const response = await server.inject({
      method: "GET",
      url: "/config",
      headers: {
        origin: "https://any-origin.example.com",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://any-origin.example.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.json()).toEqual({ environment: "test" });
  });

  it("does not block OPTIONS requests", async () => {
    const server = await setupFastify();

    server.post("/payments/session", async () => ({ sessionToken: "test" }));

    const response = await server.inject({
      method: "OPTIONS",
      url: "/payments/session",
      headers: {
        origin: "https://any-origin.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-session-id",
      },
    });

    // OPTIONS returns 204 and reflects any origin/header with permissive CORS headers.
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://any-origin.example.com");
    expect(response.headers["access-control-allow-headers"]).toBe("content-type,x-session-id");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });
});
