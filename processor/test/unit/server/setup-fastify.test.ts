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
    sessionHeaderAuthHookFn: { authenticate: () => async () => {} },
    jwtAuthHookFn: { authenticate: () => async () => {} },
    oauth2AuthHookFn: { authenticate: () => async () => {} },
    authorityAuthorizationHookFn: { authorize: () => () => async () => {} },
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
    loggerLevel: "info",
    checkoutUrl: "https://checkout.europe-west1.gcp.commercetools.com",
    corsAllowedOrigins: [],
    jwtIssuer: "https://mc-api.europe-west1.gcp.commercetools.com",
  },
}));

describe("setupFastify CORS", () => {
  beforeEach(() => {
    paymentService.getSupportedPaymentComponents.mockResolvedValue({
      dropins: [],
      components: [{ type: "card" }],
      express: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows the Merchant Center origin derived from the JWT issuer", async () => {
    const { setupFastify } = await import("../../../src/server/server");
    const server = await setupFastify();

    try {
      server.get("/ping", async () => ({ ok: true }));

      const origin = "https://mc.europe-west1.gcp.commercetools.com";
      const response = await server.inject({
        method: "GET",
        url: "/ping",
        headers: { origin },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.json()).toEqual({ ok: true });
    } finally {
      await server.close();
    }
  });

  it("does not add CORS headers when corsAllowedOrigins is exactly ['*']", async () => {
    vi.resetModules();
    // Runtime-selected config override — static import cannot work here because
    // vi.resetModules() wipes the module registry and we need a fresh instantiation
    // with a different config value.
    vi.doMock("../../../src/config/config", () => ({
      config: {
        loggerLevel: "info",
        checkoutUrl: "https://checkout.europe-west1.gcp.commercetools.com",
        corsAllowedOrigins: ["*"],
        jwtIssuer: "https://mc-api.europe-west1.gcp.commercetools.com",
      },
    }));
    vi.doMock("@fastify/autoload", () => ({ default: async () => {} }));
    vi.doMock("../../../src/payment-sdk", () => ({
      paymentSDK: {
        sessionHeaderAuthHookFn: { authenticate: () => async () => {} },
        jwtAuthHookFn: { authenticate: () => async () => {} },
        oauth2AuthHookFn: { authenticate: () => async () => {} },
        authorityAuthorizationHookFn: { authorize: () => () => async () => {} },
      },
    }));
    vi.doMock("../../../src/server/app", () => ({
      app: { services: { paymentService } },
    }));

    const { setupFastify } = await import("../../../src/server/server");
    const server = await setupFastify();

    try {
      server.get("/ping", async () => ({ ok: true }));

      const response = await server.inject({
        method: "OPTIONS",
        url: "/ping",
        headers: {
          origin: "https://any-origin.example.com",
          "access-control-request-method": "GET",
        },
      });

      // Without @fastify/cors, OPTIONS falls through to the route or 404 — it must NOT
      // return a 403/500 CORS rejection and must NOT set a restrictive
      // access-control-allow-origin header.
      expect(response.statusCode).not.toBe(403);
      expect(response.statusCode).not.toBe(500);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await server.close();
      vi.resetModules();
    }
  });

  it("still enforces CORS for explicit origin lists", async () => {
    vi.resetModules();
    vi.doMock("../../../src/config/config", () => ({
      config: {
        loggerLevel: "info",
        checkoutUrl: "https://checkout.europe-west1.gcp.commercetools.com",
        corsAllowedOrigins: ["https://allowed.example.com"],
        jwtIssuer: "https://mc-api.europe-west1.gcp.commercetools.com",
      },
    }));
    vi.doMock("@fastify/autoload", () => ({ default: async () => {} }));
    vi.doMock("../../../src/payment-sdk", () => ({
      paymentSDK: {
        sessionHeaderAuthHookFn: { authenticate: () => async () => {} },
        jwtAuthHookFn: { authenticate: () => async () => {} },
        oauth2AuthHookFn: { authenticate: () => async () => {} },
        authorityAuthorizationHookFn: { authorize: () => () => async () => {} },
      },
    }));
    vi.doMock("../../../src/server/app", () => ({
      app: { services: { paymentService } },
    }));

    const { setupFastify } = await import("../../../src/server/server");
    const server = await setupFastify();

    try {
      server.get("/ping", async () => ({ ok: true }));

      const allowed = await server.inject({
        method: "GET",
        url: "/ping",
        headers: { origin: "https://allowed.example.com" },
      });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.headers["access-control-allow-origin"]).toBe("https://allowed.example.com");

      const blocked = await server.inject({
        method: "GET",
        url: "/ping",
        headers: { origin: "https://not-allowed.example.com" },
      });
      expect(blocked.statusCode).toBe(500);
      expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await server.close();
      vi.resetModules();
    }
  });
});
