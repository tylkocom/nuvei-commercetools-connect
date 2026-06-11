import type { FastifyInstance } from "fastify";
import { operationsRoute } from "../../routes/operation.route.js";
import { app } from "../app.js";

export default async function (server: FastifyInstance) {
  const routeOptions = {
    paymentService: app.services.paymentService,
  };

  await server.register(operationsRoute, routeOptions);
  await server.register(operationsRoute, { ...routeOptions, prefix: "/operations" });
}
