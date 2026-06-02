import { Static, Type } from "@sinclair/typebox";

/**
 * Central registry of payment methods supported by this integration.
 *
 * Both the processor and the enabler MUST keep their method lists aligned
 * with this array. When a new method is added here, update the enabler's
 * `PaymentMethod` enum and `NuveiEnabler.createComponentBuilder()` as well.
 */
export const SUPPORTED_PAYMENT_METHODS: readonly string[] = ["card", "dropin"] as const;

/**
 * Type-safe check whether a payment method is supported.
 */
export function isSupportedPaymentMethod(method: string): method is (typeof SUPPORTED_PAYMENT_METHODS)[number] {
  return (SUPPORTED_PAYMENT_METHODS as readonly string[]).includes(method);
}

const DropinType = Type.Enum({
  EMBEDDED: "embedded",
  HPP: "hpp",
});

export const SupportedPaymentDropinsData = Type.Object({
  type: DropinType,
});

export const SupportedPaymentComponentsData = Type.Object({
  type: Type.String(),
  subtypes: Type.Optional(Type.Array(Type.String())),
});

export const SupportedExpressPaymentData = Type.Object({
  type: Type.String(),
});

/**
 * Supported payment components schema.
 *
 * Example:
 * {
 *   "dropins": [
 *     {
 *       "type": "embedded"
 *     }
 *   ],
 *   "components": [
 *     {
 *       "type": "card"
 *     },
 *     {
 *       "type": "applepay"
 *     }
 *   ]
 * }
 */
export const SupportedPaymentComponentsSchema = Type.Object({
  dropins: Type.Array(SupportedPaymentDropinsData),
  components: Type.Array(SupportedPaymentComponentsData),
  express: Type.Array(SupportedExpressPaymentData),
});

export type SupportedPaymentComponentsSchemaDTO = Static<typeof SupportedPaymentComponentsSchema>;
