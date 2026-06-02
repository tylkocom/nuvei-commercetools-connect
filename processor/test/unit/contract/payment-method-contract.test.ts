import { describe, expect, it } from "vitest";
import type {
  CommercetoolsCartService,
  CommercetoolsOrderService,
  CommercetoolsPaymentService,
} from "@commercetools/connect-payments-sdk";
import { NuveiPaymentService } from "../../../src/services/nuvei-payment.service";
import {
  PAYMENT_METHOD_REGISTRY as processorPaymentMethodRegistry,
  SUPPORTED_PAYMENT_METHODS as processorSupportedPaymentMethods,
  isSupportedPaymentMethod as isProcessorSupportedPaymentMethod,
} from "../../../src/dtos/operations/payment-components.dto";
import { NuveiEnabler } from "../../../../enabler/src/index";
import type { EnablerOptions } from "../../../../enabler/src/payment-enabler/payment-enabler";
import {
  PAYMENT_METHOD_REGISTRY as enablerPaymentMethodRegistry,
  SUPPORTED_PAYMENT_METHODS as enablerSupportedPaymentMethods,
} from "../../../../enabler/src/payment-enabler/method-registry";

function publicRegistryContract(
  registry: ReadonlyArray<{
    key: string;
    kind: string;
    advertisedType: string;
    displayName: string;
    transitional: boolean;
    pspMetadata: Record<string, never>;
  }>,
) {
  return registry.map(({ key, kind, advertisedType, displayName, transitional, pspMetadata }) => ({
    key,
    kind,
    advertisedType,
    displayName,
    transitional,
    pspMetadata,
  }));
}

function makePaymentService(): NuveiPaymentService {
  return new NuveiPaymentService({
    ctCartService: {} as CommercetoolsCartService,
    ctPaymentService: {} as CommercetoolsPaymentService,
    ctOrderService: {} as CommercetoolsOrderService,
  });
}

function makeEnablerOptions(): EnablerOptions {
  return {
    processorUrl: "https://processor.example.com",
    sessionId: "session-123",
    merchantId: "merchant-123",
    merchantSiteId: "site-456",
    env: "test",
  };
}

describe("processor/enabler payment method contract parity", () => {
  it("keeps mirrored registry public contract fields aligned in deterministic order", () => {
    expect(publicRegistryContract(processorPaymentMethodRegistry)).toEqual(
      publicRegistryContract(enablerPaymentMethodRegistry),
    );
    expect(processorPaymentMethodRegistry.map((entry) => entry.key)).toEqual(
      enablerPaymentMethodRegistry.map((entry) => entry.key),
    );
  });

  it("keeps processor accepted methods equal to enabler-supported builder keys", () => {
    const processorRegistryKeys = processorPaymentMethodRegistry.map((entry) => entry.key);
    const enablerRegistryKeys = enablerPaymentMethodRegistry.map((entry) => entry.key);

    expect(processorSupportedPaymentMethods).toEqual(processorRegistryKeys);
    expect(processorSupportedPaymentMethods).toEqual(enablerRegistryKeys);
    expect(enablerSupportedPaymentMethods).toEqual(enablerRegistryKeys);

    for (const method of enablerRegistryKeys) {
      expect(isProcessorSupportedPaymentMethod(method)).toBe(true);
    }

    for (const unsupportedMethod of ["paypal", "dropin", ""] as const) {
      expect(isProcessorSupportedPaymentMethod(unsupportedMethod)).toBe(false);
    }
  });

  it("keeps card as a component and embedded as a transitional drop-in with empty PSP metadata", () => {
    expect(processorPaymentMethodRegistry).toEqual([
      expect.objectContaining({
        key: "card",
        kind: "component",
        advertisedType: "card",
        displayName: expect.any(String),
        transitional: false,
        pspMetadata: {},
      }),
      expect.objectContaining({
        key: "embedded",
        kind: "dropin",
        advertisedType: "embedded",
        displayName: expect.any(String),
        transitional: true,
        pspMetadata: {},
      }),
    ]);

    for (const entry of processorPaymentMethodRegistry) {
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.pspMetadata).toEqual({});
      expect(Object.keys(entry.pspMetadata)).toHaveLength(0);
    }
  });

  it("maps /payment-components advertisements exactly to registry entries", async () => {
    const service = makePaymentService();
    const advertised = await service.getSupportedPaymentComponents();

    expect(advertised).toEqual({
      dropins: [{ type: "embedded" }],
      components: [{ type: "card" }],
      express: [],
    });
    expect(advertised.components).toEqual(
      processorPaymentMethodRegistry
        .filter((entry) => entry.kind === "component")
        .map((entry) => ({ type: entry.advertisedType })),
    );
    expect(advertised.dropins).toEqual(
      processorPaymentMethodRegistry
        .filter((entry) => entry.kind === "dropin")
        .map((entry) => ({ type: entry.advertisedType })),
    );
  });

  it("builds every advertised component and drop-in through the enabler", async () => {
    const service = makePaymentService();
    const advertised = await service.getSupportedPaymentComponents();
    const enabler = new NuveiEnabler(makeEnablerOptions());

    for (const component of advertised.components) {
      const builder = await enabler.createComponentBuilder(component.type);
      expect(builder.componentHasSubmit).toBe(false);
      expect(typeof builder.build).toBe("function");
    }

    for (const dropin of advertised.dropins) {
      const builder = await enabler.createDropinBuilder(dropin.type);
      expect(builder.dropinHasSubmit).toBe(false);
      expect(typeof builder.build).toBe("function");
    }
  });
});
