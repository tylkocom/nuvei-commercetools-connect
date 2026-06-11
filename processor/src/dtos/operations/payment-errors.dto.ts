import { Static, Type } from "@sinclair/typebox";

export const PublicPaymentErrorCode = {
  CONFIG_INVALID: "CONFIG_INVALID",
  METHOD_UNSUPPORTED: "METHOD_UNSUPPORTED",
  REQUEST_MALFORMED: "REQUEST_MALFORMED",
  AUTH_SESSION_INVALID: "AUTH_SESSION_INVALID",
  CART_NOT_LOCKABLE: "CART_NOT_LOCKABLE",
} as const;

export type PublicPaymentErrorCode =
  (typeof PublicPaymentErrorCode)[keyof typeof PublicPaymentErrorCode];

export const PublicPaymentErrorSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
});

export type PublicPaymentErrorSchemaDTO = Static<typeof PublicPaymentErrorSchema>;

const PUBLIC_MESSAGES: Record<PublicPaymentErrorCode, string> = {
  [PublicPaymentErrorCode.CONFIG_INVALID]: "Payment setup configuration is invalid.",
  [PublicPaymentErrorCode.METHOD_UNSUPPORTED]: "Payment method is not supported.",
  [PublicPaymentErrorCode.REQUEST_MALFORMED]: "Payment setup request is malformed.",
  [PublicPaymentErrorCode.AUTH_SESSION_INVALID]: "Payment session is invalid.",
  [PublicPaymentErrorCode.CART_NOT_LOCKABLE]: "Cart cannot be locked for payment.",
};

export class PaymentSetupError extends Error {
  public readonly code: PublicPaymentErrorCode;
  public readonly diagnostics: Readonly<Record<string, string | undefined>>;
  public readonly statusCode: number;

  constructor(
    code: PublicPaymentErrorCode,
    diagnostics: Readonly<Record<string, string | undefined>> = {},
    statusCode = code === PublicPaymentErrorCode.METHOD_UNSUPPORTED ? 422 : 400,
  ) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "PaymentSetupError";
    this.code = code;
    this.diagnostics = diagnostics;
    this.statusCode = statusCode;
  }

  public toPublicError(): PublicPaymentErrorSchemaDTO {
    return {
      code: this.code,
      message: this.message,
    };
  }
}
