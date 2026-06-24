export enum PaymentMethod {
  card = "card",
  blik = "blik",
  embedded = "embedded",
}

export type PaymentMethodKind = "component" | "dropin";
export type PaymentMethodKey = `${PaymentMethod}`;

export type PaymentMethodRegistryEntry = {
  key: PaymentMethodKey;
  kind: PaymentMethodKind;
  advertisedType: PaymentMethodKey;
  displayName: string;
  transitional: boolean;
  pspMetadata: Record<string, never>;
};

export const PAYMENT_METHOD_REGISTRY = [
  {
    key: PaymentMethod.card,
    kind: "component",
    advertisedType: PaymentMethod.card,
    displayName: "Nuvei card",
    transitional: false,
    pspMetadata: {},
  },
  {
    key: PaymentMethod.blik,
    kind: "component",
    advertisedType: PaymentMethod.blik,
    displayName: "BLIK",
    transitional: false,
    pspMetadata: {},
  },
  {
    key: PaymentMethod.embedded,
    kind: "dropin",
    advertisedType: PaymentMethod.embedded,
    displayName: "Nuvei Simply Connect",
    transitional: false,
    pspMetadata: {},
  },
] as const satisfies readonly PaymentMethodRegistryEntry[];

export const SUPPORTED_PAYMENT_METHODS: readonly PaymentMethodKey[] = PAYMENT_METHOD_REGISTRY.map(
  (entry) => entry.key,
);

export function isSupportedPaymentMethod(method: string): method is PaymentMethodKey {
  return (SUPPORTED_PAYMENT_METHODS as readonly string[]).includes(method);
}

export function getPaymentMethodRegistryEntry(
  method: string,
): PaymentMethodRegistryEntry | undefined {
  return PAYMENT_METHOD_REGISTRY.find((entry) => entry.key === method);
}

export function getComponentPaymentMethods(): readonly PaymentMethodRegistryEntry[] {
  return PAYMENT_METHOD_REGISTRY.filter((entry) => entry.kind === "component");
}

export function getDropinPaymentMethods(): readonly PaymentMethodRegistryEntry[] {
  return PAYMENT_METHOD_REGISTRY.filter((entry) => entry.kind === "dropin");
}
