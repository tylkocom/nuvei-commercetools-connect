import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@commercetools/connect-payments-sdk", () => ({
  SessionHeaderAuthenticationHook: class {
    authenticate = () => async () => {};
  },
  Oauth2AuthenticationHook: class {
    authenticate = () => async () => {};
  },
  JWTAuthenticationHook: class {
    authenticate = () => async () => {};
  },
  AuthorityAuthorizationHook: class {
    authorize =
      (..._perms: string[]) =>
      async () => {};
  },
}));

vi.mock("@sinclair/typebox", () => ({
  Type: {
    Array: (items: unknown) => ({ type: "array", items }),
    Enum: (values: Record<string, string>) => ({ enum: Object.values(values) }),
    Object: (properties: Record<string, unknown>) => ({ type: "object", properties }),
    Optional: (schema: unknown) => schema,
    String: () => ({ type: "string" }),
  },
}));

vi.mock("../../../src/dtos/operations/config.dto", () => ({
  ConfigResponseSchema: { type: "object" },
  ConfigResponseSchemaDTO: {},
}));

vi.mock("../../../src/dtos/operations/payment-intents.dto", () => ({
  PaymentIntentRequestSchema: { type: "object" },
  PaymentIntentRequestSchemaDTO: {},
  PaymentIntentResponseSchema: { type: "object" },
  PaymentIntentResponseSchemaDTO: {},
}));

vi.mock("../../../src/dtos/operations/status.dto", () => ({
  StatusResponseSchema: { type: "object" },
  StatusResponseSchemaDTO: {},
}));

vi.mock("../../../src/dtos/operations/health.dto", () => ({
  HealthResponseSchema: { type: "object" },
  HealthCheckItemSchema: { type: "object" },
}));

vi.mock("../../../src/dtos/operations/transaction.dto", () => ({
  TransactionDraft: { type: "object" },
  TransactionDraftDTO: {},
  TransactionResponse: { type: "object" },
  TransactionResponseDTO: {},
}));

vi.mock("../../../src/services/abstract-payment.service", () => ({
  AbstractPaymentService: class {},
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { operationsRoute } from "../../../src/routes/operation.route";
import { PAYMENT_METHOD_REGISTRY } from "../../../src/dtos/operations/payment-components.dto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;

interface RouteEntry {
  method: string;
  url: string;
  handler: RouteHandler;
}

type TestRouteRegistrar = (url: string, opts: unknown, handler: RouteHandler) => void;

interface TestFastify {
  get: TestRouteRegistrar;
  post: TestRouteRegistrar;
}

type BuiltApp = {
  fastify: TestFastify;
  routes: RouteEntry[];
};

function buildApp(): BuiltApp {
  const routes: RouteEntry[] = [];

  const fastify: TestFastify = {
    get: vi.fn((url: string, _opts: unknown, handler: RouteHandler) => {
      routes.push({ method: "GET", url, handler });
    }),
    post: vi.fn((url: string, _opts: unknown, handler: RouteHandler) => {
      routes.push({ method: "POST", url, handler });
    }),
  };

  return { fastify, routes };
}

function makeReply() {
  const sent: unknown[] = [];
  const codes: number[] = [];
  const reply = {
    code: vi.fn((_c: number) => reply),
    status: vi.fn((_c: number) => reply),
    send: vi.fn((body: unknown) => {
      sent.push(body);
    }),
    _sent: sent,
    _codes: codes,
  };
  return reply;
}

function expectedPaymentComponentsFromRegistry() {
  return {
    dropins: PAYMENT_METHOD_REGISTRY.filter((entry) => entry.kind === "dropin").map((entry) => ({
      type: entry.advertisedType,
    })),
    components: PAYMENT_METHOD_REGISTRY.filter((entry) => entry.kind === "component").map((entry) => ({
      type: entry.advertisedType,
    })),
    express: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("operation routes", () => {
  const paymentService = {
    config: vi.fn(),
    status: vi.fn(),
    getSupportedPaymentComponents: vi
      .fn()
      .mockResolvedValue({ dropins: [], components: [], express: [] }),
    modifyPayment: vi.fn(),
    handleTransaction: vi.fn(),
    health: vi.fn(),
  };

  let app: BuiltApp;

  beforeEach(async () => {
    vi.restoreAllMocks();
    paymentService.config.mockResolvedValue({
      environment: "test",
      merchantId: "m1",
      merchantSiteId: "s1",
    });
    paymentService.status.mockResolvedValue({ status: "UP" });
    paymentService.getSupportedPaymentComponents.mockResolvedValue(
      expectedPaymentComponentsFromRegistry(),
    );
    paymentService.modifyPayment.mockResolvedValue({ outcome: "approved" });
    paymentService.handleTransaction.mockResolvedValue({
      transactionStatus: { state: "Pending", errors: [] },
    });
    paymentService.health.mockResolvedValue({ status: "ok", checks: [] });

    app = buildApp();

    const {
      SessionHeaderAuthenticationHook,
      Oauth2AuthenticationHook,
      JWTAuthenticationHook,
      AuthorityAuthorizationHook,
    } = await import("@commercetools/connect-payments-sdk");

    await operationsRoute(
      app.fastify as unknown as Parameters<typeof operationsRoute>[0],
      {
        sessionHeaderAuthHook: new SessionHeaderAuthenticationHook(),
        oauth2AuthHook: new Oauth2AuthenticationHook(),
        jwtAuthHook: new JWTAuthenticationHook(),
        authorizationHook: new AuthorityAuthorizationHook(),
        paymentService,
      } as unknown as Parameters<typeof operationsRoute>[1],
    );
  });

  it("registers /config route that delegates to paymentService.config()", async () => {
    const configRoute = app.routes.find((r) => r.url === "/config");
    expect(configRoute).toBeDefined();
    expect(configRoute!.method).toBe("GET");

    const reply = makeReply();
    await configRoute!.handler({}, reply);

    expect(paymentService.config).toHaveBeenCalledOnce();
    expect(reply.send).toHaveBeenCalledWith({
      environment: "test",
      merchantId: "m1",
      merchantSiteId: "s1",
    });
    expect(reply.code).toHaveBeenCalledWith(200);
  });

  it("registers /status route that delegates to paymentService.status()", async () => {
    const statusRoute = app.routes.find((r) => r.url === "/status");
    expect(statusRoute).toBeDefined();
    expect(statusRoute!.method).toBe("GET");

    const reply = makeReply();
    await statusRoute!.handler({}, reply);

    expect(paymentService.status).toHaveBeenCalledOnce();
    expect(reply.send).toHaveBeenCalledWith({ status: "UP" });
    expect(reply.code).toHaveBeenCalledWith(200);
  });

  it("registers GET /health route with no auth preHandler", async () => {
    const healthRoute = app.routes.find((r) => r.url === "/health");
    expect(healthRoute).toBeDefined();
    expect(healthRoute!.method).toBe("GET");
  });

  it("GET /health returns 200 with ok status when all checks pass", async () => {
    const healthRoute = app.routes.find((r) => r.url === "/health");
    const okChecks = [
      { name: "CTP_PROJECT_KEY", status: "ok" },
      { name: "NUVEI_SECRET_KEY", status: "ok" },
    ];
    paymentService.health.mockResolvedValueOnce({ status: "ok", checks: okChecks });
    const reply = makeReply();
    await healthRoute!.handler({}, reply);
    expect(paymentService.health).toHaveBeenCalledOnce();
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ status: "ok", checks: okChecks });
  });

  it("GET /health returns 200 with degraded status when a check fails", async () => {
    const healthRoute = app.routes.find((r) => r.url === "/health");
    const degradedChecks = [
      { name: "CTP_PROJECT_KEY", status: "ok" },
      { name: "NUVEI_SECRET_KEY", status: "failed" },
    ];
    paymentService.health.mockResolvedValueOnce({ status: "degraded", checks: degradedChecks });
    const reply = makeReply();
    await healthRoute!.handler({}, reply);
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ status: "degraded", checks: degradedChecks });
  });

  it("registers /payment-intents/:id route that extracts params and calls modifyPayment()", async () => {
    const modifyRoute = app.routes.find((r) => r.url === "/payment-intents/:id");
    expect(modifyRoute).toBeDefined();
    expect(modifyRoute!.method).toBe("POST");

    const request = {
      params: { id: "payment-42" },
      body: {
        actions: [{ action: "capturePayment", amount: { centAmount: 1000, currencyCode: "USD" } }],
      },
    };
    const reply = makeReply();
    await modifyRoute!.handler(request, reply);

    expect(paymentService.modifyPayment).toHaveBeenCalledWith({
      paymentId: "payment-42",
      data: request.body,
    });
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ outcome: "approved" });
  });

  // -------------------------------------------------------------------------
  // GET /payment-components
  // -------------------------------------------------------------------------
  describe("GET /payment-components", () => {
    it("registers route and returns expected component list", async () => {
      const componentsRoute = app.routes.find((r) => r.url === "/payment-components");
      expect(componentsRoute).toBeDefined();
      expect(componentsRoute!.method).toBe("GET");

      const reply = makeReply();
      await componentsRoute!.handler({}, reply);

      expect(paymentService.getSupportedPaymentComponents).toHaveBeenCalledOnce();
      expect(expectedPaymentComponentsFromRegistry()).toEqual({
        dropins: [],
        components: [{ type: "card" }],
        express: [],
      });
      expect(reply.send).toHaveBeenCalledWith(expectedPaymentComponentsFromRegistry());
      expect(reply.code).toHaveBeenCalledWith(200);
    });
  });

  // -------------------------------------------------------------------------
  // POST /payment-intents/:id with various actions
  // -------------------------------------------------------------------------
  describe("POST /payment-intents/:id with capturePayment action", () => {
    it("delegates to modifyPayment with capturePayment action data", async () => {
      const modifyRoute = app.routes.find((r) => r.url === "/payment-intents/:id");
      expect(modifyRoute).toBeDefined();

      paymentService.modifyPayment.mockResolvedValueOnce({ outcome: "approved" });

      const request = {
        params: { id: "payment-99" },
        body: {
          actions: [
            {
              action: "capturePayment",
              amount: { centAmount: 5000, currencyCode: "EUR" },
            },
          ],
        },
      };
      const reply = makeReply();
      await modifyRoute!.handler(request, reply);

      expect(paymentService.modifyPayment).toHaveBeenCalledWith({
        paymentId: "payment-99",
        data: request.body,
      });
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ outcome: "approved" });
    });
  });

  describe("POST /payment-intents/:id with cancelPayment action", () => {
    it("delegates to modifyPayment with cancelPayment action data", async () => {
      const modifyRoute = app.routes.find((r) => r.url === "/payment-intents/:id");
      expect(modifyRoute).toBeDefined();

      paymentService.modifyPayment.mockResolvedValueOnce({ outcome: "approved" });

      const request = {
        params: { id: "payment-88" },
        body: {
          actions: [
            {
              action: "cancelPayment",
            },
          ],
        },
      };
      const reply = makeReply();
      await modifyRoute!.handler(request, reply);

      expect(paymentService.modifyPayment).toHaveBeenCalledWith({
        paymentId: "payment-88",
        data: request.body,
      });
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ outcome: "approved" });
    });
  });

  // -------------------------------------------------------------------------
  // POST /transactions
  // -------------------------------------------------------------------------
  describe("POST /transactions", () => {
    it("registers route and delegates to paymentService.handleTransaction", async () => {
      const txRoute = app.routes.find((r) => r.url === "/transactions");
      expect(txRoute).toBeDefined();
      expect(txRoute!.method).toBe("POST");

      const requestBody = {
        cartId: "cart-abc-123",
        paymentInterface: "nuvei",
      };

      const reply = makeReply();
      await txRoute!.handler({ body: requestBody }, reply);

      expect(paymentService.handleTransaction).toHaveBeenCalledWith(requestBody);
      expect(reply.status).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({
        transactionStatus: { state: "Pending", errors: [] },
      });
    });
  });
});
