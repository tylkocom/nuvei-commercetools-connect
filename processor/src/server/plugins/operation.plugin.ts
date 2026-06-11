import type { FastifyInstance } from "fastify";
import { paymentSDK } from "../../payment-sdk.js";
import { operationsRoute } from "../../routes/operation.route.js";
import { app } from "../app.js";

export default async function (server: FastifyInstance) {
  const routeOptions = {
    paymentService: app.services.paymentService,
    jwtAuthHook: paymentSDK.jwtAuthHookFn,
    oauth2AuthHook: paymentSDK.oauth2AuthHookFn,
    sessionHeaderAuthHook: paymentSDK.sessionHeaderAuthHookFn,
    authorizationHook: paymentSDK.authorityAuthorizationHookFn,
  };

  await server.register(operationsRoute, routeOptions);
  await server.register(operationsRoute, { ...routeOptions, prefix: "/operations" });
}
