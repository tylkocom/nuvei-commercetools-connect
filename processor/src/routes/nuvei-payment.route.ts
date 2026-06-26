import type { SessionHeaderAuthenticationHook } from "@commercetools/connect-payments-sdk";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  PaymentResponseSchema,
  PaymentMethodOptionsSchema,
  PaymentConfirmRequestSchema,
  PaymentConfirmResponseSchema,
} from "../dtos/nuvei-payment.dto.js";
import type {
  PaymentResponseSchemaDTO,
  PaymentMethodOptionsSchemaDTO,
  PaymentConfirmRequestSchemaDTO,
  PaymentConfirmResponseSchemaDTO,
} from "../dtos/nuvei-payment.dto.js";
import type { NuveiHeaderAuthHook } from "../libs/fastify/hooks/nuvei-header-auth.hook.js";
import { DmnChecksumInvalidError } from "../services/nuvei-payment.service.js";
import type { NuveiPaymentService } from "../services/nuvei-payment.service.js";
import { PaymentSetupError } from "../dtos/operations/payment-errors.dto.js";
import { log } from "../libs/logger/index.js";

type PaymentRoutesOptions = {
  paymentService: NuveiPaymentService;
  sessionHeaderAuthHook: SessionHeaderAuthenticationHook;
};

type WebhookRoutesOptions = {
  paymentService: NuveiPaymentService;
  nuveiHeaderAuthHook: NuveiHeaderAuthHook;
};

function getSafeDmnDiagnosticFields(body: Record<string, unknown>): Record<string, string> {
  return {
    merchantUniqueId: String(body.merchant_unique_id ?? ""),
    clientUniqueId: String(body.clientUniqueId ?? ""),
    pppTransactionId: String(
      body.PPP_TransactionID ?? body.PPP_TransactionId ?? body.ppp_TransactionID ?? "",
    ),
    transactionId: String(body.TransactionID ?? body.transactionId ?? ""),
    transactionType: String(body.transactionType ?? ""),
    pppStatus: String(body.ppp_status ?? ""),
  };
}

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
    Reply: PaymentResponseSchemaDTO | { code: string; message: string };
  }>(
    "/session",
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        body: PaymentMethodOptionsSchema,
        response: {
          200: PaymentResponseSchema,
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
    Reply: PaymentConfirmResponseSchemaDTO;
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
          200: PaymentConfirmResponseSchema,
          402: PaymentConfirmResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const result = await opts.paymentService.confirmPayment(id, request.body.sessionToken);
      const statusCode = result.outcome === "rejected" ? 402 : 200;
      return reply.status(statusCode).send({ outcome: result.outcome });
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
          ...getSafeDmnDiagnosticFields(body),
        });
        return reply.status(500).send({ error: "Processing failed." });
      }
    },
  );
};
