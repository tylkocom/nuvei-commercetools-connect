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

  it("does not treat '*' as a wildcard CORS origin", async () => {
    vi.resetModules();
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

      expect(response.statusCode).toBe(403);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await server.close();
      vi.resetModules();
    }
  });

  it("reflects only configured explicit CORS origins", async () => {
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
      expect(blocked.statusCode).toBe(200);
      expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();

      const blockedPreflight = await server.inject({
        method: "OPTIONS",
        url: "/ping",
        headers: {
          origin: "https://not-allowed.example.com",
          "access-control-request-method": "GET",
        },
      });
      expect(blockedPreflight.statusCode).toBe(403);
      expect(blockedPreflight.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await server.close();
      vi.resetModules();
    }
  });

  it("short-circuits allowed payment session preflights before route auth", async () => {
    vi.resetModules();
    vi.doMock("../../../src/config/config", () => ({
      config: {
        loggerLevel: "info",
        checkoutUrl: "https://checkout.europe-west1.gcp.commercetools.com",
        corsAllowedOrigins: ["https://shelfmarket-dev.public.cloud.oklyt.pl"],
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
    let authCalls = 0;

    try {
      server.post(
        "/payments/session",
        {
          preHandler: [
            async () => {
              authCalls += 1;
              throw new Error("auth must not run for preflight");
            },
          ],
        },
        async () => ({ ok: true }),
      );

      const response = await server.inject({
        method: "OPTIONS",
        url: "/payments/session",
        headers: {
          origin: "https://shelfmarket-dev.public.cloud.oklyt.pl",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type, x-session-id",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(
        "https://shelfmarket-dev.public.cloud.oklyt.pl",
      );
      expect(response.headers["access-control-allow-methods"]).toContain("POST");
      expect(response.headers["access-control-allow-headers"]).toContain("X-Session-ID");
      expect(response.body).toBe("");
      expect(authCalls).toBe(0);
    } finally {
      await server.close();
      vi.resetModules();
    }
  });
});
