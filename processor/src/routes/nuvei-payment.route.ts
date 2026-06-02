import { SessionHeaderAuthenticationHook } from "@commercetools/connect-payments-sdk";
import { Type } from "@sinclair/typebox";
import { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  PaymentResponseSchema,
  PaymentResponseSchemaDTO,
  PaymentMethodOptionsSchema,
  PaymentMethodOptionsSchemaDTO,
  PaymentConfirmRequestSchema,
  PaymentConfirmRequestSchemaDTO,
} from "../dtos/nuvei-payment.dto.js";
import {
  PaymentIntentResponseSchema,
  PaymentModificationStatus,
} from "../dtos/operations/payment-intents.dto.js";
import {
  DmnChecksumInvalidError,
  NuveiPaymentService,
} from "../services/nuvei-payment.service.js";
import { NuveiHeaderAuthHook } from "../libs/fastify/hooks/nuvei-header-auth.hook.js";
import {
  PaymentSetupError,
  PublicPaymentErrorSchema,
  type PublicPaymentErrorSchemaDTO,
} from "../dtos/operations/payment-errors.dto.js";
import { log } from "../libs/logger/index.js";

type PaymentRoutesOptions = {
  paymentService: NuveiPaymentService;
  sessionHeaderAuthHook: SessionHeaderAuthenticationHook;
};

type WebhookRoutesOptions = {
  paymentService: NuveiPaymentService;
  nuveiHeaderAuthHook: NuveiHeaderAuthHook;
};

/**
 * Payment routes for the Nuvei connector.
 *
 * POST /session - Create a payment session with payment method options
 * POST /confirm/:id - Confirm a payment after Nuvei widget completion
 */
export const paymentRoutes = async (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions & PaymentRoutesOptions,
) => {

  // POST /session - Create a payment session with payment method options support
  fastify.post<{
    Body: PaymentMethodOptionsSchemaDTO;
    Reply: PaymentResponseSchemaDTO | PublicPaymentErrorSchemaDTO;
  }>(
    "/session",
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        body: PaymentMethodOptionsSchema,
        response: {
          200: PaymentResponseSchema,
          400: PublicPaymentErrorSchema,
          422: PublicPaymentErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const resp = await opts.paymentService.createPaymentSession(request.body);
        return reply.status(200).send(resp);
      } catch (error) {
        if (error instanceof PaymentSetupError) {
          log.warn("Payment setup request rejected.", {
            route: "POST /payments/session",
            code: error.code,
            ...error.diagnostics,
          });
          return reply.status(error.statusCode).send(error.toPublicError());
        }

        throw error;
      }
    },
  );

  fastify.post<{
    Body: PaymentConfirmRequestSchemaDTO;
    Reply: { outcome: "approved" | "rejected" };
    Params: { id: string };
  }>(
    "/confirm/:id",
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        params: {
          $id: "confirmParamsSchema",
          type: "object",
          properties: {
            id: Type.String(),
          },
          required: ["id"],
        },
        body: PaymentConfirmRequestSchema,
        response: {
          200: PaymentIntentResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      try {
        await opts.paymentService.confirmPayment(id, request.body.sessionToken);

        return reply.status(200).send({ outcome: PaymentModificationStatus.APPROVED });
      } catch (error) {
        log.error("Payment confirmation failed", {
          error: error instanceof Error ? error.message : "Unknown error",
          paymentId: id,
        });
        return reply.status(400).send({ outcome: PaymentModificationStatus.REJECTED });
      }
    },
  );
};

/**
 * Webhook routes for Nuvei DMN (Direct Merchant Notification).
 *
 * POST /nuvei - Receive and process Nuvei DMN webhooks
 */
export const nuveiWebhookRoutes = async (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions & WebhookRoutesOptions,
) => {
  fastify.post(
    "/nuvei",
    {
      preHandler: [opts.nuveiHeaderAuthHook.authenticate()],
      config: { rawBody: true },
    },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;

      try {
        await opts.paymentService.processNuveiDmn(body);
        return reply.status(200).send();
      } catch (error) {
        const isChecksumError = error instanceof DmnChecksumInvalidError;
        if (isChecksumError) {
          log.error("Invalid DMN checksum received.", {
            merchantId: body.merchant_id,
          });
          return reply.status(400).send({ error: "Invalid checksum." });
        }

        log.error("Error processing Nuvei DMN", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return reply.status(500).send({ error: "Processing failed." });
      }
    },
  );
};
