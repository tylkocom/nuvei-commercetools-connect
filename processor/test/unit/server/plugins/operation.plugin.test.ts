import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import operationPlugin from "../../../../src/server/plugins/operation.plugin";
import { operationsRoute } from "../../../../src/routes/operation.route";

vi.mock("../../../../src/payment-sdk", () => ({
  paymentSDK: {
    sessionHeaderAuthHookFn: { name: "session" },
    jwtAuthHookFn: { name: "jwt" },
    oauth2AuthHookFn: { name: "oauth2" },
    authorityAuthorizationHookFn: { name: "authorization" },
  },
}));

vi.mock("../../../../src/server/app", () => ({
  app: {
    services: {
      paymentService: { name: "paymentService" },
    },
  },
}));

vi.mock("../../../../src/routes/operation.route", () => ({
  operationsRoute: vi.fn(),
}));

describe("operation plugin", () => {
  it("registers operation routes at the root and /operations prefix", async () => {
    const register = vi.fn(async () => {});
    const server = { register } as unknown as FastifyInstance;

    await operationPlugin(server);

    expect(register).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenNthCalledWith(
      1,
      operationsRoute,
      expect.objectContaining({ paymentService: { name: "paymentService" } }),
    );
    expect(register).toHaveBeenNthCalledWith(
      2,
      operationsRoute,
      expect.objectContaining({
        paymentService: { name: "paymentService" },
        prefix: "/operations",
      }),
    );
  });
});
