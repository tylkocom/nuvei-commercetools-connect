import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../src/libs/logger/index", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../../src/libs/fastify/hooks/nuvei-header-auth.hook", () => ({
  NuveiHeaderAuthHook: class {
    authenticate = () => async () => {};
  },
}));

vi.mock("../../../src/dtos/nuvei-payment.dto", () => ({}));

vi.mock("../../../src/dtos/operations/payment-intents.dto", () => ({
  PaymentIntentResponseSchema: { type: "object" },
  PaymentModificationStatus: { APPROVED: "approved", REJECTED: "rejected" },
}));

vi.mock("../../../src/services/nuvei-payment.service", () => ({
  NuveiPaymentService: class {},
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { nuveiWebhookRoutes } from "../../../src/routes/nuvei-payment.route";
import { DmnChecksumInvalidError } from "../../../src/services/dmn-reconciler";
import {
  dmnAuthOk,
  dmnAuthFail,
  dmnSettleOk,
  dmnCreditOk,
  dmnVoidOk,
  dmnMerchantMismatch,
  dmnMalformed,
} from "../fixtures/dmn.fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RouteEntry {
  method: string;
  url: string;
  opts: any;
  handler: (request: any, reply: any) => Promise<any>;
}

function buildApp() {
  const routes: RouteEntry[] = [];

  const fastify = {
    post: vi.fn((url: string, opts: any, handler: any) => {
      routes.push({ method: "POST", url, opts, handler });
    }),
  } as any;

  return { fastify, routes };
}

function makeReply() {
  const sent: unknown[] = [];
  const statusResult = {
    send: vi.fn((b: unknown) => {
      sent.push(b);
    }),
  };
  return {
    status: vi.fn((_c: number) => statusResult),
    send: vi.fn((b: unknown) => {
      sent.push(b);
    }),
    code: vi.fn((_c: number) => statusResult),
    _sent: sent,
    statusResult,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("webhook route – DMN processing", () => {
  const mockProcessNuveiDmn = vi.fn();

  const paymentService = {
    processNuveiDmn: mockProcessNuveiDmn,
  } as any;

  let app: ReturnType<typeof buildApp>;
  let nuveiHeaderAuthHook: any;

  beforeEach(async () => {
    mockProcessNuveiDmn.mockReset();
    app = buildApp();

    const { NuveiHeaderAuthHook } =
      await import("../../../src/libs/fastify/hooks/nuvei-header-auth.hook");
    nuveiHeaderAuthHook = new NuveiHeaderAuthHook();

    await nuveiWebhookRoutes(app.fastify, { paymentService, nuveiHeaderAuthHook } as any);
  });

  // -------------------------------------------------------------------------
  // Success scenarios
  // -------------------------------------------------------------------------
  describe("successful DMN processing", () => {
    it("valid Auth DMN → 200", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei");
      expect(webhookRoute).toBeDefined();

      mockProcessNuveiDmn.mockResolvedValue(undefined);

      const reply = makeReply();
      await webhookRoute!.handler({ body: dmnAuthOk } as any, reply);

      expect(mockProcessNuveiDmn).toHaveBeenCalledWith(dmnAuthOk);
      expect(reply.status).toHaveBeenCalledWith(200);
    });

    it("valid Auth FAIL DMN → 200", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei")!;

      mockProcessNuveiDmn.mockResolvedValue(undefined);

      const reply = makeReply();
      await webhookRoute.handler({ body: dmnAuthFail } as any, reply);

      expect(mockProcessNuveiDmn).toHaveBeenCalledWith(dmnAuthFail);
      expect(reply.status).toHaveBeenCalledWith(200);
    });

    it("valid Settle DMN → 200", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei")!;

      mockProcessNuveiDmn.mockResolvedValue(undefined);

      const reply = makeReply();
      await webhookRoute.handler({ body: dmnSettleOk } as any, reply);

      expect(mockProcessNuveiDmn).toHaveBeenCalledWith(dmnSettleOk);
      expect(reply.status).toHaveBeenCalledWith(200);
    });

    it("valid Credit DMN → 200", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei")!;

      mockProcessNuveiDmn.mockResolvedValue(undefined);

      const reply = makeReply();
      await webhookRoute.handler({ body: dmnCreditOk } as any, reply);

      expect(mockProcessNuveiDmn).toHaveBeenCalledWith(dmnCreditOk);
      expect(reply.status).toHaveBeenCalledWith(200);
    });

    it("valid Void DMN → 200", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei")!;

      mockProcessNuveiDmn.mockResolvedValue(undefined);

      const reply = makeReply();
      await webhookRoute.handler({ body: dmnVoidOk } as any, reply);

      expect(mockProcessNuveiDmn).toHaveBeenCalledWith(dmnVoidOk);
      expect(reply.status).toHaveBeenCalledWith(200);
    });
  });

  // -------------------------------------------------------------------------
  // Checksum failures
  // -------------------------------------------------------------------------
  describe("checksum validation", () => {
    it("invalid DMN checksum → returns 400", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei");
      expect(webhookRoute).toBeDefined();

      mockProcessNuveiDmn.mockRejectedValue(new DmnChecksumInvalidError());

      const body = {
        merchant_unique_id: "payment-1",
        TransactionID: "tx-1",
        advanceResponseChecksum: "bad-checksum",
      };

      const reply = makeReply();
      await webhookRoute!.handler({ body } as any, reply);

      expect(mockProcessNuveiDmn).toHaveBeenCalledWith(body);
      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it("missing advanceResponseChecksum → returns 400", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei")!;

      mockProcessNuveiDmn.mockRejectedValue(new DmnChecksumInvalidError());

      const body = { merchant_unique_id: "payment-1", TransactionID: "tx-1" };

      const reply = makeReply();
      await webhookRoute.handler({ body } as any, reply);

      expect(mockProcessNuveiDmn).toHaveBeenCalledWith(body);
      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  // -------------------------------------------------------------------------
  // Processing errors
  // -------------------------------------------------------------------------
  describe("processing errors", () => {
    it("processNuveiDmn throws → returns 500", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei");
      expect(webhookRoute).toBeDefined();

      mockProcessNuveiDmn.mockRejectedValue(new Error("Processing error"));

      const reply = makeReply();
      await webhookRoute!.handler(
        { body: { ...dmnAuthOk, advanceResponseChecksum: "valid-checksum" } } as any,
        reply,
      );

      expect(reply.status).toHaveBeenCalledWith(500);
    });

    it("processNuveiDmn throws for malformed DMN → returns 500", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei")!;

      mockProcessNuveiDmn.mockRejectedValue(
        new Error("Missing required DMN field: TransactionID or TransactionId"),
      );

      const reply = makeReply();
      await webhookRoute.handler({ body: dmnMalformed } as any, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
    });

    it("processNuveiDmn throws for merchant mismatch → returns 500", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei")!;

      mockProcessNuveiDmn.mockRejectedValue(
        new Error("DMN merchant_id does not match configured merchant"),
      );

      const reply = makeReply();
      await webhookRoute.handler({ body: dmnMerchantMismatch } as any, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe("edge cases", () => {
    it("empty body with invalid checksum → returns 400", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei")!;

      mockProcessNuveiDmn.mockRejectedValue(new DmnChecksumInvalidError());

      const reply = makeReply();
      await webhookRoute.handler({ body: {} } as any, reply);

      expect(mockProcessNuveiDmn).toHaveBeenCalledWith({});
      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it("valid checksum but service throws generic Error → returns 500", async () => {
      const webhookRoute = app.routes.find((r) => r.url === "/nuvei")!;

      mockProcessNuveiDmn.mockRejectedValue(new Error("Unexpected error"));

      const reply = makeReply();
      await webhookRoute.handler({ body: dmnAuthOk } as any, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
    });
  });
});
