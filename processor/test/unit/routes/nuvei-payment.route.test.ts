import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  PaymentSetupError,
  PublicPaymentErrorCode,
} from "../../../src/dtos/operations/payment-errors.dto";
import Fastify from "fastify";

vi.mock("@commercetools/connect-payments-sdk", () => ({
  SessionHeaderAuthenticationHook: class {
    authenticate = () => async () => {};
  },
}));

vi.mock("../../../src/services/nuvei-payment.service", () => ({
  DmnChecksumInvalidError: class extends Error {},
  NuveiPaymentService: class {},
}));

vi.mock("../../../src/libs/logger/index", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import { SessionHeaderAuthenticationHook } from "@commercetools/connect-payments-sdk";
import { paymentRoutes } from "../../../src/routes/nuvei-payment.route";
import { log } from "../../../src/libs/logger/index";

type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;

type RouteEntry = {
  method: string;
  url: string;
  handler: RouteHandler;
};

type TestRouteRegistrar = (url: string, opts: unknown, handler: RouteHandler) => void;

type TestFastify = {
  get: TestRouteRegistrar;
  post: TestRouteRegistrar;
};

type BuiltApp = {
  fastify: TestFastify;
  routes: RouteEntry[];
};

type ReturnStatus = (code: number) => ReplyDouble;

type ReplyDouble = {
  status: ReturnStatus;
  send: (body: unknown) => ReplyDouble;
};

type PaymentRouteRequest = {
  body: unknown;
};

type MockCreatePaymentSession = {
  (options?: unknown): Promise<unknown>;
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (value: unknown) => void;
};

type MockConfirmPayment = {
  (paymentReference: string, sessionToken: string): Promise<unknown>;
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (value: unknown) => void;
};

type PaymentServiceDouble = {
  createPaymentSession: MockCreatePaymentSession;
  confirmPayment: MockConfirmPayment;
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

function makeReply(): ReplyDouble & { sent: unknown[]; statuses: number[] } {
  const sent: unknown[] = [];
  const statuses: number[] = [];
  const reply = {
    status: vi.fn((code: number) => {
      statuses.push(code);
      return reply;
    }),
    send: vi.fn((body: unknown) => {
      sent.push(body);
      return reply;
    }),
    sent,
    statuses,
  };
  return reply;
}

async function buildFastifyApp(paymentService: PaymentServiceDouble) {
  const fastify = Fastify();
  await fastify.register(paymentRoutes, {
    paymentService,
    sessionHeaderAuthHook: new SessionHeaderAuthenticationHook(),
  } as unknown as Parameters<typeof paymentRoutes>[1]);
  await fastify.ready();
  return fastify;
}

describe("payment routes", () => {
  let app: BuiltApp;
  let paymentService: PaymentServiceDouble;

  beforeEach(async () => {
    vi.mocked(log.warn).mockReset();
    paymentService = {
      createPaymentSession: vi.fn(),
      confirmPayment: vi.fn(),
    };
    app = buildApp();

    await paymentRoutes(
      app.fastify as unknown as Parameters<typeof paymentRoutes>[0],
      {
        paymentService,
        sessionHeaderAuthHook: new SessionHeaderAuthenticationHook(),
      } as unknown as Parameters<typeof paymentRoutes>[1],
    );
  });

  it("does not register the removed GET / payment route", () => {
    expect(app.routes.find((route) => route.method === "GET" && route.url === "/")).toBeUndefined();
  });

  it("registers POST /confirm/:id and not the legacy camelCase confirm route", async () => {
    paymentService.confirmPayment.mockResolvedValue({ outcome: "approved" });

    expect(
      app.routes.find((route) => route.method === "POST" && route.url === "/confirmPayments/:id"),
    ).toBeUndefined();
    const confirmRoute = app.routes.find(
      (route) => route.method === "POST" && route.url === "/confirm/:id",
    );
    expect(confirmRoute).toBeDefined();

    const reply = makeReply();
    await confirmRoute?.handler(
      { params: { id: "payment-1" }, body: { sessionToken: "session-token-1" } },
      reply,
    );

    expect(paymentService.confirmPayment).toHaveBeenCalledWith("payment-1", "session-token-1");
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ outcome: "approved" });
  });
  it("POST /session returns successful payment response", async () => {
    paymentService.createPaymentSession.mockResolvedValue({
      cartId: "cart-1",
      sessionToken: "session-token-1",
      paymentReference: "payment-1",
      merchantReturnUrl: "https://example.com/return",
    });

    const postRoute = app.routes.find(
      (route) => route.method === "POST" && route.url === "/session",
    );
    expect(postRoute).toBeDefined();

    const body = { paymentMethodOptions: { card: {} } };
    const reply = makeReply();
    await postRoute?.handler({ body } satisfies PaymentRouteRequest, reply);

    expect(paymentService.createPaymentSession).toHaveBeenCalledWith(body);
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({
      cartId: "cart-1",
      sessionToken: "session-token-1",
      paymentReference: "payment-1",
      merchantReturnUrl: "https://example.com/return",
    });
  });

  it("POST /session maps unsupported methods to a safe public error", async () => {
    paymentService.createPaymentSession.mockRejectedValue(
      new PaymentSetupError(PublicPaymentErrorCode.METHOD_UNSUPPORTED, {
        category: "method_unsupported",
        requestedMethod: "wechatpay",
      }),
    );

    const postRoute = app.routes.find(
      (route) => route.method === "POST" && route.url === "/session",
    );
    const reply = makeReply();
    await postRoute?.handler(
      {
        body: { paymentMethodOptions: { wechatpay: { token: "secret" } } },
      } satisfies PaymentRouteRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(422);
    expect(reply.send).toHaveBeenCalledWith({
      code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      message: "Payment method is not supported.",
    });
    expect(reply.sent[0]).toEqual({
      code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      message: "Payment method is not supported.",
    });
    expect(Object.keys(reply.sent[0] as Record<string, unknown>).sort()).toEqual([
      "code",
      "message",
    ]);
    expect(log.warn).toHaveBeenCalledWith("Payment setup request rejected.", {
      route: "POST /payments/session",
      code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      category: "method_unsupported",
      requestedMethod: "wechatpay",
    });
    expect(log.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paymentMethodOptions: expect.anything() }),
    );
  });

  it("POST /session unsupported methods reach semantic validation at the Fastify boundary", async () => {
    paymentService.createPaymentSession.mockRejectedValue(
      new PaymentSetupError(PublicPaymentErrorCode.METHOD_UNSUPPORTED, {
        category: "method_unsupported",
        requestedMethod: "wechatpay",
      }),
    );
    const fastify = await buildFastifyApp(paymentService);

    const response = await fastify.inject({
      method: "POST",
      url: "/session",
      payload: {
        paymentMethodOptions: {
          wechatpay: {
            token: "secret",
          },
        },
      },
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body)).toEqual({
      code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      message: "Payment method is not supported.",
    });
    expect(paymentService.createPaymentSession).toHaveBeenCalledWith({
      paymentMethodOptions: {
        wechatpay: {
          token: "secret",
        },
      },
    });

    await fastify.close();
  });
  it("POST /session maps malformed requests to a safe public error", async () => {
    paymentService.createPaymentSession.mockRejectedValue(
      new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: "method_ambiguous",
      }),
    );

    const postRoute = app.routes.find(
      (route) => route.method === "POST" && route.url === "/session",
    );
    const reply = makeReply();
    await postRoute?.handler(
      { body: { paymentMethodOptions: { card: {}, paypal: {} } } } satisfies PaymentRouteRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      code: PublicPaymentErrorCode.REQUEST_MALFORMED,
      message: "Payment setup request is malformed.",
    });
    expect(Object.keys(reply.sent[0] as Record<string, unknown>).sort()).toEqual([
      "code",
      "message",
    ]);
  });

  // -------------------------------------------------------------------------
  // POST /confirm/:id – tri-state outcome contract (D-01, D-05, D-06)
  // These tests FAIL against the current implementation and will pass after
  // Task 2 implementation.
  // -------------------------------------------------------------------------

  it("POST /confirm/:id – pending service result returns 200 { outcome: 'pending' } (D-01, D-05)", async () => {
    paymentService.confirmPayment.mockResolvedValue({ outcome: "pending" });

    const confirmRoute = app.routes.find((r) => r.method === "POST" && r.url === "/confirm/:id");
    expect(confirmRoute).toBeDefined();

    const reply = makeReply();
    await confirmRoute?.handler(
      { params: { id: "payment-1" }, body: { sessionToken: "session-token-1" } },
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ outcome: "pending" });
  });

  it("POST /confirm/:id – rejected service result returns 402 { outcome: 'rejected' } (D-05)", async () => {
    paymentService.confirmPayment.mockResolvedValue({ outcome: "rejected" });

    const confirmRoute = app.routes.find((r) => r.method === "POST" && r.url === "/confirm/:id");
    expect(confirmRoute).toBeDefined();

    const reply = makeReply();
    await confirmRoute?.handler(
      { params: { id: "payment-1" }, body: { sessionToken: "session-token-1" } },
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(402);
    expect(reply.send).toHaveBeenCalledWith({ outcome: "rejected" });
  });

  it("POST /confirm/:id – thrown technical error is NOT returned as { outcome: 'rejected' } (D-06)", async () => {
    // Arrange: service throws a technical error (session/cart mismatch, etc.)
    paymentService.confirmPayment.mockRejectedValue(
      new Error("Payment does not belong to authenticated cart session"),
    );

    const fastify = await buildFastifyApp(paymentService);

    const response = await fastify.inject({
      method: "POST",
      url: "/confirm/payment-1",
      payload: { sessionToken: "session-token-1" },
    });

    // Must NOT be a business 402 rejected outcome
    expect(response.statusCode).not.toBe(402);
    expect(response.statusCode).not.toBe(400);
    // Must NOT contain business rejected body
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body).not.toEqual({ outcome: "rejected" });

    await fastify.close();
  });
});
