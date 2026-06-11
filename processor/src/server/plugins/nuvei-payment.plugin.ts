import { FastifyInstance } from "fastify";
import { paymentRoutes, nuveiWebhookRoutes } from "../../routes/nuvei-payment.route.js";
import { app } from "../app.js";

export default async function (server: FastifyInstance) {
  await server.register(paymentRoutes, {
    prefix: "/payments",
    paymentService: app.services.paymentService,
  });

  await server.register(nuveiWebhookRoutes, {
    prefix: "/webhooks",
    paymentService: app.services.paymentService,
  });
}
