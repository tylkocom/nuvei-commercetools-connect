import { Static, Type } from "@sinclair/typebox";

export const PaymentResponseSchema = Type.Object({
  cartId: Type.String(),
  sessionToken: Type.String(),
  paymentReference: Type.String(),
  merchantReturnUrl: Type.String(),
  amount: Type.String(),
  currency: Type.String(),
});

export type PaymentResponseSchemaDTO = Static<typeof PaymentResponseSchema>;

export const PaymentMethodOptionsSchema = Type.Object(
  {
    paymentMethodOptions: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

export type PaymentMethodOptionsSchemaDTO = Static<typeof PaymentMethodOptionsSchema>;

export const PaymentConfirmRequestSchema = Type.Object({
  sessionToken: Type.String({ minLength: 1 }),
});

export type PaymentConfirmRequestSchemaDTO = Static<typeof PaymentConfirmRequestSchema>;
export const PaymentConfirmResponseSchema = Type.Object({
  outcome: Type.Union([
    Type.Literal("approved"),
    Type.Literal("rejected"),
    Type.Literal("pending"),
  ]),
});

export type PaymentConfirmResponseSchemaDTO = Static<typeof PaymentConfirmResponseSchema>;
