import { Static, Type } from "@sinclair/typebox";

type PaymentComponentKind = "component" | "dropin";

export type PaymentMethodRegistryEntry = {
  key: "card" | "embedded";
  kind: PaymentComponentKind;
  advertisedType: "card" | "embedded";
  displayName: string;
  transitional: boolean;
  pspMetadata: Record<string, never>;
};

/**
 * Processor-local mirror of the Phase 1 payment method contract.
 *
 * Keep PSP request-shaping metadata empty until Phase 2 Nuvei sandbox evidence
 * proves the values. Do not share this module with the enabler in Phase 1.
 */
export const PAYMENT_METHOD_REGISTRY = [
  {
    key: "card",
    kind: "component",
    advertisedType: "card",
    displayName: "Nuvei card",
    transitional: false,
    pspMetadata: {},
  },
  {
    key: "embedded",
    kind: "dropin",
    advertisedType: "embedded",
    displayName: "Nuvei embedded drop-in",
    transitional: true,
    pspMetadata: {},
  },
] as const satisfies readonly PaymentMethodRegistryEntry[];

export const SUPPORTED_PAYMENT_METHODS = PAYMENT_METHOD_REGISTRY.map((entry) => entry.key);

export type SupportedPaymentMethod = (typeof SUPPORTED_PAYMENT_METHODS)[number];

export const METHOD_NAMES: Record<SupportedPaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHOD_REGISTRY.map((entry) => [entry.key, entry.displayName]),
) as Record<SupportedPaymentMethod, string>;

/**
 * Type-safe check whether a payment method is supported.
 */
export function isSupportedPaymentMethod(method: string): method is SupportedPaymentMethod {
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
