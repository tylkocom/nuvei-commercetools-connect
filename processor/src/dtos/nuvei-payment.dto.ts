import { Static, Type } from "@sinclair/typebox";
import { PAYMENT_METHOD_REGISTRY } from "./operations/payment-components.dto.js";

export const PaymentResponseSchema = Type.Object({
  cartId: Type.String(),
  sessionToken: Type.String(),
  paymentReference: Type.String(),
  merchantReturnUrl: Type.String(),
});

export type PaymentResponseSchemaDTO = Static<typeof PaymentResponseSchema>;

const EmptyMethodOptionsSchema = Type.Object({}, { additionalProperties: false });

const PaymentMethodOptionShapes = PAYMENT_METHOD_REGISTRY.map((entry) =>
  Type.Object(
    {
      [entry.key]: EmptyMethodOptionsSchema,
    },
    { additionalProperties: false },
  ),
);

export const PaymentMethodOptionsSchema = Type.Object(
  {
    paymentMethodOptions: Type.Optional(Type.Union(PaymentMethodOptionShapes)),
  },
  { additionalProperties: false },
);

export type PaymentMethodOptionsSchemaDTO = Static<typeof PaymentMethodOptionsSchema>;

export const PaymentConfirmRequestSchema = Type.Object({
  sessionToken: Type.String({ minLength: 1 }),
});

export type PaymentConfirmRequestSchemaDTO = Static<typeof PaymentConfirmRequestSchema>;
