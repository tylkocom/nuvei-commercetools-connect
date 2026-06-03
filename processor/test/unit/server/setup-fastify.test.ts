import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupFastify } from "../../../src/server/server";
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
    const server = await setupFastify();

    try {
      server.get("/ping", async () => ({ ok: true }));

      const origin = "https://mc.europe-west1.gcp.commercetools.com";
      const response = await server.inject({
        method: "GET",
        url: "/ping",
        headers: {
          origin,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.json()).toEqual({ ok: true });
    } finally {
      await server.close();
    }
  });
});
