import { describe, expect, it, vi } from "vitest";
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
import {
  NuveiEnabler,
  NuveiSimplyConnectEnabler,
  NuveiWebSdkEnabler,
} from "../../../../enabler/src/index";
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
    ctCartClient: { carts: () => ({ withId: () => ({}) }) } as never,
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

function expectFacadeModeRejection(mode: unknown): void {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  try {
    let caught: unknown;

    try {
      new NuveiEnabler(makeEnablerOptions(), mode as any);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: string }).code).toBe("METHOD_UNSUPPORTED");
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
}

describe("processor/enabler payment method contract parity", () => {
  it("keeps mirrored registry public contract fields aligned in deterministic order", () => {
    expect(publicRegistryContract(processorPaymentMethodRegistry)).toEqual([
      {
        key: "card",
        kind: "component",
        advertisedType: "card",
        displayName: expect.any(String),
        transitional: false,
        pspMetadata: {},
      },
    ]);
    expect(publicRegistryContract(enablerPaymentMethodRegistry)).toEqual([
      {
        key: "card",
        kind: "component",
        advertisedType: "card",
        displayName: expect.any(String),
        transitional: false,
        pspMetadata: {},
      },
    ]);
    expect(processorPaymentMethodRegistry.map((entry) => entry.key)).toEqual(["card"]);
    expect(enablerPaymentMethodRegistry.map((entry) => entry.key)).toEqual(["card"]);
  });
  it("keeps processor accepted methods equal to enabler-supported builder keys", () => {
    expect(processorSupportedPaymentMethods).toEqual(["card"]);
    expect(enablerSupportedPaymentMethods).toEqual(["card"]);
    expect(isProcessorSupportedPaymentMethod("card")).toBe(true);

    for (const unsupportedMethod of ["paypal", "applepay", ""] as const) {
      expect(isProcessorSupportedPaymentMethod(unsupportedMethod)).toBe(false);
    }
  });

  it("keeps card as the only component with empty PSP metadata and no dropins", () => {
    expect(processorPaymentMethodRegistry).toEqual([
      expect.objectContaining({
        key: "card",
        kind: "component",
        advertisedType: "card",
        displayName: expect.any(String),
        transitional: false,
        pspMetadata: {},
      }),
    ]);

    expect(processorPaymentMethodRegistry).toHaveLength(1);

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
      dropins: [],
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

  it("builds every advertised component through the Simply Connect enabler", async () => {
    const service = makePaymentService();
    const advertised = await service.getSupportedPaymentComponents();
    const enabler = new NuveiSimplyConnectEnabler(makeEnablerOptions());

    for (const component of advertised.components) {
      const builder = await enabler.createComponentBuilder(component.type);
      expect(builder.componentHasSubmit).toBe(false);
      expect(typeof builder.build).toBe("function");
    }
  });

  describe("dual-mode enabler contract", () => {
    it("NuveiSimplyConnectEnabler builds card with componentHasSubmit=false", async () => {
      const builder = await new NuveiSimplyConnectEnabler(
        makeEnablerOptions(),
      ).createComponentBuilder("card");

      expect(builder.componentHasSubmit).toBe(false);
      expect(typeof builder.build).toBe("function");
    });

    it("NuveiWebSdkEnabler builds card with componentHasSubmit=true", async () => {
      const builder = await new NuveiWebSdkEnabler(makeEnablerOptions()).createComponentBuilder(
        "card",
      );

      expect(builder.componentHasSubmit).toBe(true);
      expect(typeof builder.build).toBe("function");
    });

    it("NuveiEnabler facade rejects missing mode before processor call", () => {
      expectFacadeModeRejection(undefined);
    });

    it("NuveiEnabler facade rejects unsupported mode before processor call", () => {
      expectFacadeModeRejection("hpp");
    });

    it("card is the method key for both modes — mode is not a processor payment method", async () => {
      expect(processorSupportedPaymentMethods).not.toContain("simply-connect");
      expect(processorSupportedPaymentMethods).not.toContain("web-sdk");

      const simplyConnectBuilder = await new NuveiSimplyConnectEnabler(
        makeEnablerOptions(),
      ).createComponentBuilder("card");
      const webSdkBuilder = await new NuveiWebSdkEnabler(
        makeEnablerOptions(),
      ).createComponentBuilder("card");

      expect(simplyConnectBuilder.componentHasSubmit).toBe(false);
      expect(webSdkBuilder.componentHasSubmit).toBe(true);
    });
  });
});
