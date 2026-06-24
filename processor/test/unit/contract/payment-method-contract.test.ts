import { afterEach, describe, expect, it, vi } from "vitest";
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
import { Enabler } from "../../../../enabler/src/index";
import type { CheckoutEnablerOptions } from "../../../../enabler/src/payment-enabler/payment-enabler";
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

function makeEnablerOptions(): CheckoutEnablerOptions {
  return {
    processorUrl: "https://processor.example.com",
    sessionId: "session-123",
  };
}

function stubProcessorConfigFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          environment: "test",
          merchantId: "merchant-123",
          merchantSiteId: "site-456",
        }),
      ),
    ),
  );
}

describe("processor/enabler payment method contract parity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
      {
        key: "blik",
        kind: "component",
        advertisedType: "blik",
        displayName: expect.any(String),
        transitional: false,
        pspMetadata: {},
      },
      {
        key: "embedded",
        kind: "dropin",
        advertisedType: "embedded",
        displayName: expect.any(String),
        transitional: false,
        pspMetadata: {},
      },
    ]);
    expect(publicRegistryContract(enablerPaymentMethodRegistry)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "card",
          kind: "component",
          advertisedType: "card",
          transitional: false,
          pspMetadata: {},
        }),
        expect.objectContaining({
          key: "embedded",
          kind: "dropin",
          advertisedType: "embedded",
          transitional: false,
          pspMetadata: {},
        }),
      ]),
    );
    expect(processorPaymentMethodRegistry.map((entry) => entry.key)).toEqual(["card", "blik", "embedded"]);
    expect(enablerPaymentMethodRegistry.map((entry) => entry.key)).toEqual(
      expect.arrayContaining(["card", "embedded"]),
    );
  });
  it("keeps processor default advertisements buildable by enabler-supported builder keys", () => {
    expect(processorSupportedPaymentMethods).toEqual(["card", "blik", "embedded"]);
    expect(enablerSupportedPaymentMethods).toEqual(expect.arrayContaining(["card", "embedded"]));
    expect(isProcessorSupportedPaymentMethod("card")).toBe(true);
    expect(isProcessorSupportedPaymentMethod("blik")).toBe(true);
    expect(isProcessorSupportedPaymentMethod("embedded")).toBe(true);

    for (const unsupportedMethod of ["paypal", "applepay", "hpp", "apmgw_BLIK", ""] as const) {
      expect(isProcessorSupportedPaymentMethod(unsupportedMethod)).toBe(false);
    }
  });

  it("keeps card, BLIK, and embedded entries with empty PSP metadata", () => {
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
        key: "blik",
        kind: "component",
        advertisedType: "blik",
        displayName: expect.any(String),
        transitional: false,
        pspMetadata: {},
      }),
      expect.objectContaining({
        key: "embedded",
        kind: "dropin",
        advertisedType: "embedded",
        displayName: expect.any(String),
        transitional: false,
        pspMetadata: {},
      }),
    ]);

    expect(processorPaymentMethodRegistry).toHaveLength(3);

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
      components: [{ type: "card" }, { type: "blik" }],
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

  it("builds every advertised component through the Checkout Enabler", async () => {
    stubProcessorConfigFetch();
    const service = makePaymentService();
    const advertised = await service.getSupportedPaymentComponents();
    const enabler = new Enabler(makeEnablerOptions());

    for (const component of advertised.components) {
      const builder = await enabler.createComponentBuilder(component.type);
      expect(builder.componentHasSubmit).toBe(true);
      expect(typeof builder.build).toBe("function");
    }
  });

  it("builds every advertised drop-in through the Checkout Enabler", async () => {
    stubProcessorConfigFetch();
    const service = makePaymentService();
    const advertised = await service.getSupportedPaymentComponents();
    const enabler = new Enabler(makeEnablerOptions());

    for (const dropin of advertised.dropins) {
      expect(dropin.type).toBe("embedded");
      const builder = await enabler.createDropinBuilder(dropin.type);
      expect(builder.dropinHasSubmit).toBe(false);
      expect("componentHasSubmit" in builder).toBe(false);
      expect(typeof builder.build).toBe("function");
    }
  });

  it("implementation modes are not processor payment methods", () => {
    expect(processorSupportedPaymentMethods).not.toContain("simply-connect");
    expect(processorSupportedPaymentMethods).not.toContain("web-sdk");
  });
});
