import {
  AuthorityAuthorizationHook,
  JWTAuthenticationHook,
  Oauth2AuthenticationHook,
  SessionHeaderAuthenticationHook,
} from "@commercetools/connect-payments-sdk";
import { Type } from "@sinclair/typebox";
import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { ConfigResponseSchema, ConfigResponseSchemaDTO } from "../dtos/operations/config.dto.js";
import { SupportedPaymentComponentsSchema } from "../dtos/operations/payment-components.dto.js";
import {
  PaymentIntentRequestSchema,
  PaymentIntentRequestSchemaDTO,
  PaymentIntentResponseSchema,
  PaymentIntentResponseSchemaDTO,
} from "../dtos/operations/payment-intents.dto.js";
import { StatusResponseSchema, StatusResponseSchemaDTO } from "../dtos/operations/status.dto.js";
import { HealthResponseSchema, HealthResponseSchemaDTO } from "../dtos/operations/health.dto.js";
import { AbstractPaymentService } from "../services/abstract-payment.service.js";
import {
  TransactionDraft,
  TransactionDraftDTO,
  TransactionResponse,
  TransactionResponseDTO,
} from "../dtos/operations/transaction.dto.js";

type OperationRouteOptions = {
  sessionHeaderAuthHook: SessionHeaderAuthenticationHook;
  oauth2AuthHook: Oauth2AuthenticationHook;
  jwtAuthHook: JWTAuthenticationHook;
  authorizationHook: AuthorityAuthorizationHook;
  paymentService: AbstractPaymentService;
};

export const operationsRoute = async (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions & OperationRouteOptions,
) => {
  // Public by design: Checkout fetches connector config BEFORE a session
  // exists, so this route must not require session auth. The response schema
  // is limited to shopper-safe values (environment, merchantId, merchantSiteId)
  // that the browser widget embeds anyway — never add secrets here.
  fastify.get<{ Reply: ConfigResponseSchemaDTO }>(
    "/config",
    {
      schema: {
        response: {
          200: ConfigResponseSchema,
        },
      },
    },
    async (_, reply) => {
      const config = await opts.paymentService.config();
      return reply.code(200).send(config);
    },
  );

  fastify.get<{ Reply: StatusResponseSchemaDTO }>(
    "/status",
    {
      preHandler: [opts.jwtAuthHook.authenticate()],
      schema: {
        response: {
          200: StatusResponseSchema,
        },
      },
    },
    async (_, reply) => {
      const status = await opts.paymentService.status();
      return reply.code(200).send(status);
    },
  );

  fastify.get<{ Reply: HealthResponseSchemaDTO }>(
    "/health",
    {
      schema: {
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    async (_, reply) => {
      const result = await opts.paymentService.health();
      return reply.status(200).send(result);
    },
  );

  fastify.get(
    "/payment-components",
    {
      preHandler: [opts.jwtAuthHook.authenticate()],
      schema: {
        response: {
          200: SupportedPaymentComponentsSchema,
        },
      },
    },
    async (_, reply) => {
      const result = await opts.paymentService.getSupportedPaymentComponents();
      return reply.code(200).send(result);
    },
  );

  fastify.post<{
    Body: PaymentIntentRequestSchemaDTO;
    Reply: PaymentIntentResponseSchemaDTO;
    Params: { id: string };
  }>(
    "/payment-intents/:id",
    {
      preHandler: [
        opts.oauth2AuthHook.authenticate(),
        opts.authorizationHook.authorize("manage_project", "manage_checkout_payment_intents"),
      ],
      schema: {
        params: {
          $id: "paramsSchema",
          type: "object",
          properties: {
            id: Type.String(),
          },
          required: ["id"],
        },
        body: PaymentIntentRequestSchema,
        response: {
          200: PaymentIntentResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const resp = await opts.paymentService.modifyPayment({
        paymentId: id,
        data: request.body,
      });

      return reply.status(200).send(resp);
    },
  );

  // Create transaction
  fastify.post<{ Body: TransactionDraftDTO; Reply: TransactionResponseDTO }>(
    "/transactions",
    {
      preHandler: [
        opts.oauth2AuthHook.authenticate(),
        opts.authorizationHook.authorize("manage_project", "manage_checkout_transactions"),
      ],
      schema: {
        body: TransactionDraft,
        response: {
          201: TransactionResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await opts.paymentService.handleTransaction(request.body);
      return reply.status(201).send(result);
    },
  );
};
