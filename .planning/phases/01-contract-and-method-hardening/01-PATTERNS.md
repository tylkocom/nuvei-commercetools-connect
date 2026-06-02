# Phase 1: Contract and Method Hardening - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 16
**Analogs found:** 16 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `enabler/src/payment-enabler/payment-enabler.ts` | model / utility | request-response validation | same file | exact |
| `enabler/src/payment-enabler/method-registry.ts` (optional create) | model / config | transform | `enabler/src/payment-enabler/payment-enabler.ts` + `processor/src/dtos/operations/payment-components.dto.ts` | role-match |
| `enabler/src/index.ts` | provider / factory | request-response | same file | exact |
| `enabler/src/components/card.ts` | component | request-response | same file | exact |
| `enabler/src/dropin/dropin-embedded.ts` | component | request-response | same file | exact |
| `enabler/src/services/api-service.ts` | service | request-response | same file | exact |
| `processor/src/dtos/operations/payment-components.dto.ts` | model / config | transform | same file | exact |
| `processor/src/dtos/operations/payment-errors.dto.ts` (optional create) | model | request-response | `processor/src/libs/fastify/error-handler.ts` + `processor/src/dtos/nuvei-payment.dto.ts` | role-match |
| `processor/src/dtos/nuvei-payment.dto.ts` | model | request-response validation | same file + `processor/src/dtos/operations/payment-intents.dto.ts` | exact |
| `processor/src/services/nuvei-payment.service.ts` | service | request-response with external side effects | same file | exact |
| `processor/src/services/ct-payment-creation.service.ts` | service | CRUD / request-response | same file | exact |
| `processor/src/routes/nuvei-payment.route.ts` | route / controller | request-response | same file | exact |
| `processor/test/unit/services/nuvei-payment.service.test.ts` | test | request-response | same file | exact |
| `processor/test/unit/routes/operation.route.test.ts` | test | request-response | same file | exact |
| `enabler/test/unit/payment-enabler.test.ts` | test | request-response validation | same file | exact |
| `enabler/test/unit/card.test.ts` / `enabler/test/unit/dropin.test.ts` | test | request-response | same files | exact |

## Pattern Assignments

### `enabler/src/payment-enabler/payment-enabler.ts` (model / utility, request-response validation)

**Analog:** `enabler/src/payment-enabler/payment-enabler.ts`

**Imports pattern:** none; this file currently has no imports. Keep pure types/constants/helpers unless a small package-local error class is introduced.

**Registry seed pattern** (lines 8-25):
```typescript
export enum PaymentMethod {
  card = "card",
  dropin = "dropin",
}

/**
 * Ordered list of supported payment methods.
 *
 * Derived from the {@link PaymentMethod} enum so the enabler has a single
 * source of truth that mirrors the processor's `SUPPORTED_PAYMENT_METHODS`.
 */
export const SUPPORTED_PAYMENT_METHODS: readonly string[] = Object.values(PaymentMethod);
```

**Validation pattern to preserve but harden** (lines 27-65):
```typescript
export function validateEnablerOptions(opts: EnablerOptions): void {
  if (!opts.processorUrl || typeof opts.processorUrl !== "string") {
    throw new Error(
      'Invalid EnablerOptions: "processorUrl" is required and must be a non-empty string URL.',
    );
  }

  try {
    new URL(opts.processorUrl);
  } catch {
    throw new Error(
      `Invalid EnablerOptions: "processorUrl" is not a valid URL – "${opts.processorUrl}".`,
    );
  }

  if (!opts.sessionId || typeof opts.sessionId !== "string") {
    throw new Error(
      'Invalid EnablerOptions: "sessionId" is required and must be a non-empty string.',
    );
  }
```

**Planner instruction:** keep this fail-fast constructor validation boundary, but replace raw `Error` with a stable safe error shape/code for invalid config. Do not weaken the existing checks for URL, session, merchant IDs, or env.

---

### `enabler/src/payment-enabler/method-registry.ts` (optional create) (model / config, transform)

**Analogs:** `enabler/src/payment-enabler/payment-enabler.ts`, `processor/src/dtos/operations/payment-components.dto.ts`

**Enabler registry pattern to copy** (enabler lines 8-25):
```typescript
export enum PaymentMethod {
  card = "card",
  dropin = "dropin",
}

export const SUPPORTED_PAYMENT_METHODS: readonly string[] = Object.values(PaymentMethod);
```

**Processor registry/check pattern to mirror** (processor lines 1-16):
```typescript
export const SUPPORTED_PAYMENT_METHODS: readonly string[] = ["card", "dropin"] as const;

export function isSupportedPaymentMethod(method: string): method is (typeof SUPPORTED_PAYMENT_METHODS)[number] {
  return (SUPPORTED_PAYMENT_METHODS as readonly string[]).includes(method);
}
```

**Planner instruction:** if separated, keep the file tiny and data-only. Shape entries to separate method key, builder kind, advertised type, display name, transitional flag, and empty future PSP metadata. Phase 1 must not create a shared package; mirror the shape in processor and enabler and enforce parity with tests.

---

### `enabler/src/index.ts` (provider / factory, request-response)

**Analog:** `enabler/src/index.ts`

**Imports pattern** (lines 7-18):
```typescript
import type {
  PaymentComponentBuilder,
  PaymentDropinBuilder,
  PaymentEnabler,
} from "./payment-enabler/payment-enabler.js";
import {
  DropinType,
  PaymentMethod,
  SUPPORTED_PAYMENT_METHODS,
  validateEnablerOptions,
} from "./payment-enabler/payment-enabler.js";
import { DropinEmbeddedBuilder } from "./dropin/dropin-embedded.js";
import { CardComponentBuilder } from "./components/card.js";
```

**Constructor validation pattern** (lines 23-28):
```typescript
export class NuveiEnabler implements PaymentEnabler {
  private opts: import("./payment-enabler/payment-enabler.js").EnablerOptions;

  constructor(opts: import("./payment-enabler/payment-enabler.js").EnablerOptions) {
    validateEnablerOptions(opts);
    this.opts = opts;
  }
```

**Builder dispatch / unsupported error pattern to harden** (lines 30-42):
```typescript
async createComponentBuilder(type: string): Promise<PaymentComponentBuilder> {
  if (type === PaymentMethod.card) {
    return new CardComponentBuilder(this.opts);
  }
  throw new Error(
    `Component type "${type}" is not supported. Supported methods: ${SUPPORTED_PAYMENT_METHODS.join(", ")}.`,
  );
}

async createDropinBuilder(type: DropinType): Promise<PaymentDropinBuilder> {
  if (type !== DropinType.embedded) {
    throw new Error(`Dropin type "${type}" is not supported.`);
  }
  return new DropinEmbeddedBuilder(this.opts);
}
```

**Planner instruction:** keep constructor validation before any builder can be created. Derive dispatch support from the mirrored registry where practical. Unsupported component/drop-in errors should become structured safe errors with method/category diagnostics available internally.

---

### `enabler/src/components/card.ts` (component, request-response)

**Analog:** `enabler/src/components/card.ts`

**Imports pattern** (lines 1-8):
```typescript
import type {
  ComponentOptions,
  EnablerOptions,
  PaymentComponent,
  PaymentComponentBuilder,
} from "../payment-enabler/payment-enabler.js";
import { apiService, confirmPaymentResult } from "../services/api-service.js";
import { loadNuveiSdk, type NuveiResult } from "../services/nuvei-sdk.js";
```

**Create-payment request pattern** (lines 43-50):
```typescript
private async init(selector: string): Promise<void> {
  const [SafeCharge, paymentRes] = await Promise.all([
    loadNuveiSdk(),
    this.api.createPayment({ paymentMethodOptions: { card: {} } }),
  ]);
```

**Nuvei render pattern** (lines 52-70):
```typescript
const sfc = SafeCharge({
  env: this.baseOptions.env === "test" ? "int" : "prod",
  merchantId: this.baseOptions.merchantId,
  merchantSiteId: this.baseOptions.merchantSiteId,
  locale: this.baseOptions.locale,
});

sfc.createPayment({
  sessionToken: paymentRes.sessionToken,
  merchant_unique_id: paymentRes.paymentReference,
  cardHolderName: true,
  billingAddress: {
    country: "US",
    email: "",
  },
```

**Error propagation pattern** (lines 30-32):
```typescript
mount(selector: string): void {
  this.init(selector).catch((error: unknown) => this.baseOptions.onError?.(error));
}
```

**Planner instruction:** card should keep sending the registry-derived `card` method key before SDK render. Do not load Nuvei SDK or call processor from constructor; this component boundary starts side effects at `mount()`.

---

### `enabler/src/dropin/dropin-embedded.ts` (component, request-response)

**Analog:** `enabler/src/dropin/dropin-embedded.ts`

**Imports pattern** (lines 7-15):
```typescript
import type {
  DropinComponent,
  DropinOptions,
  EnablerOptions,
  PaymentDropinBuilder,
} from "../payment-enabler/payment-enabler.js";
import { apiService, confirmPaymentResult } from "../services/api-service.js";
import { loadNuveiSdk, type NuveiResult } from "../services/nuvei-sdk.js";
```

**Builder pattern** (lines 31-36):
```typescript
build(config: DropinOptions): DropinComponent {
  return new DropinComponents({
    baseOptions: this.opts,
    dropinOptions: config,
  });
}
```

**Current request-key drift to fix** (lines 61-66):
```typescript
const [paymentRes, SafeCharge] = await Promise.all([
  this.api.createPayment({ paymentMethodOptions: { dropin: {} } }),
  loadNuveiSdk(),
]);
```

**Planner instruction:** align this call with the final mirrored registry. Phase scope names transitional `embedded`; if keeping `dropin` as a backward-compatible request alias, parity tests must explicitly cover the mapping from advertised `embedded` to accepted request key. Prefer clean cutover to `{ embedded: {} }` unless compatibility is deliberately retained.

---

### `enabler/src/services/api-service.ts` (service, request-response)

**Analog:** `enabler/src/services/api-service.ts`

**Types pattern** (lines 23-31):
```typescript
export type ApiService = {
  createPayment: (opts?: CreatePaymentRequest) => Promise<PaymentSessionResponse>;
  getPayment: () => Promise<PaymentSessionResponse>;
  confirmPayment: (opts: ConfirmPaymentRequest) => Promise<ConfirmPaymentResponse>;
};

export type CreatePaymentRequest = {
  paymentMethodOptions?: Record<string, Record<string, unknown>>;
};
```

**Fetch wrapper pattern to harden** (lines 57-70):
```typescript
async createPayment(params?: CreatePaymentRequest): Promise<PaymentSessionResponse> {
  const res = await fetch(`${baseApi}/payments`, {
    method: "POST",
    headers,
    body: JSON.stringify(params ?? {}),
  });
  if (!res.ok) {
    throw new Error(`Failed to create payment: ${res.status} ${res.statusText}`);
  }
  return res.json();
},
```

**Shared confirmation error propagation** (lines 37-52):
```typescript
if (result.transactionStatus !== "APPROVED") {
  onError?.(new Error(result.reason || `Payment failed (status: ${result.transactionStatus})`));
  return;
}

try {
  await api.confirmPayment({ sessionToken: result.sessionToken, paymentReference });
  onComplete?.({
    isSuccess: true,
    paymentReference,
    sessionToken: result.sessionToken,
  });
} catch (error) {
  onError?.(error);
}
```

**Planner instruction:** update `CreatePaymentRequest` to use the registry-supported method keys and parse processor safe error payloads if exposed to consumers. Keep the wrapper thin; do not add retries or SDK behavior here.

---

### `processor/src/dtos/operations/payment-components.dto.ts` (model / config, transform)

**Analog:** `processor/src/dtos/operations/payment-components.dto.ts`

**Imports pattern** (line 1):
```typescript
import { Static, Type } from "@sinclair/typebox";
```

**Supported-method check pattern** (lines 8-16):
```typescript
export const SUPPORTED_PAYMENT_METHODS: readonly string[] = ["card", "dropin"] as const;

/**
 * Type-safe check whether a payment method is supported.
 */
export function isSupportedPaymentMethod(method: string): method is (typeof SUPPORTED_PAYMENT_METHODS)[number] {
  return (SUPPORTED_PAYMENT_METHODS as readonly string[]).includes(method);
}
```

**TypeBox response schema pattern** (lines 18-52):
```typescript
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

export const SupportedPaymentComponentsSchema = Type.Object({
  dropins: Type.Array(SupportedPaymentDropinsData),
  components: Type.Array(SupportedPaymentComponentsData),
  express: Type.Array(SupportedExpressPaymentData),
});
```

**Planner instruction:** this is the processor registry seed. Replace the flat string array with a mirrored registry if needed, then derive `SUPPORTED_PAYMENT_METHODS`, `isSupportedPaymentMethod()`, and `/payment-components` output from the same data.

---

### `processor/src/dtos/operations/payment-errors.dto.ts` (optional create) (model, request-response)

**Analogs:** `processor/src/libs/fastify/error-handler.ts`, `processor/src/dtos/nuvei-payment.dto.ts`

**Fastify/common error response pattern** (error handler lines 56-67):
```typescript
const handleErrors = (errorxList: Errorx[], reply: FastifyReply) => {
  const transformedErrors: TErrorObject[] = transformErrorxToHTTPModel(errorxList);

  // Based on CoCo specs, the root level message attribute is always set to the values from the first error. MultiErrorx enforces the same HTTP status code.
  const response: TErrorResponse = {
    message: errorxList[0].message,
    statusCode: errorxList[0].httpErrorStatus,
    errors: transformedErrors,
  };

  return reply.code(errorxList[0].httpErrorStatus).send(response);
};
```

**DTO static type pattern** (`processor/src/dtos/nuvei-payment.dto.ts` lines 1-8):
```typescript
import { Static, Type } from "@sinclair/typebox";

export const PaymentResponseSchema = Type.Object({
  cartId: Type.String(),
  sessionToken: Type.String(),
  paymentReference: Type.String(),
  merchantReturnUrl: Type.String(),
});

export type PaymentResponseSchemaDTO = Static<typeof PaymentResponseSchema>;
```

**Planner instruction:** if adding a DTO file, define the public payment setup error schema as stable `{ code, message }` (or a narrowly compatible route error object) and use it only for Phase 1 invalid setup/auth/session categories. Keep public response safe and minimal; use logs for redacted diagnostics.

---

### `processor/src/dtos/nuvei-payment.dto.ts` (model, request-response validation)

**Analog:** `processor/src/dtos/nuvei-payment.dto.ts`

**Imports / response schema pattern** (lines 1-8):
```typescript
import { Static, Type } from "@sinclair/typebox";

export const PaymentResponseSchema = Type.Object({
  cartId: Type.String(),
  sessionToken: Type.String(),
  paymentReference: Type.String(),
  merchantReturnUrl: Type.String(),
});
```

**Current broad request schema to tighten** (lines 10-16):
```typescript
export const PaymentMethodOptionsSchema = Type.Object({
  paymentMethodOptions: Type.Optional(
    Type.Record(Type.String(), Type.Record(Type.String(), Type.Unknown())),
  ),
});

export type PaymentMethodOptionsSchemaDTO = Static<typeof PaymentMethodOptionsSchema>;
```

**Existing minLength validation pattern** (lines 18-22):
```typescript
export const PaymentConfirmRequestSchema = Type.Object({
  sessionToken: Type.String({ minLength: 1 }),
});

export type PaymentConfirmRequestSchemaDTO = Static<typeof PaymentConfirmRequestSchema>;
```

**Planner instruction:** keep TypeBox at the HTTP boundary. Reject malformed shapes before service orchestration: non-object `paymentMethodOptions`, empty/multiple method keys, unknown keys, and invalid option payloads. The service should still validate defensively because callers can bypass Fastify schemas in unit tests.

---

### `processor/src/services/nuvei-payment.service.ts` (service, request-response with external side effects)

**Analog:** `processor/src/services/nuvei-payment.service.ts`

**Imports pattern for registry use** (lines 17-22):
```typescript
import {
  SupportedPaymentComponentsSchemaDTO,
  SUPPORTED_PAYMENT_METHODS,
  isSupportedPaymentMethod,
} from "../dtos/operations/payment-components.dto.js";
```

**Current helper to replace/harden** (lines 113-118):
```typescript
private getRequestedPaymentMethod(options?: {
  paymentMethodOptions?: Record<string, Record<string, unknown>>;
}): string | undefined {
  const methods = Object.keys(options?.paymentMethodOptions ?? {});
  return methods.length > 0 ? methods[0] : undefined;
}
```

**Advertisement pattern to derive from registry** (lines 369-381):
```typescript
public async getSupportedPaymentComponents(): Promise<SupportedPaymentComponentsSchemaDTO> {
  return {
    dropins: [
      {
        type: "embedded",
      },
    ],
    components: SUPPORTED_PAYMENT_METHODS.filter((m) => m !== "dropin").map((m) => ({
      type: m,
    })),
    express: [],
  };
}
```

**Current side-effect ordering bug** (lines 685-718):
```typescript
public async createPaymentIntent(options?: {
  paymentMethodOptions?: Record<string, Record<string, unknown>>;
}): Promise<{
  cartId: string;
  sessionToken: string;
  paymentReference: string;
  merchantReturnUrl: string;
}> {
  try {
    const cartId = getCartIdFromContext();
    const cart = await this.ctCartService.getCart({ id: cartId });
    const amountPlanned = await this.ctCartService.getPaymentAmount({ cart });
    const formattedAmount = this.formatAmount(amountPlanned);

    log.info("Creating Nuvei payment intent via openOrder.", {
      cartId: cart.id,
      amount: formattedAmount,
      currency: amountPlanned.currencyCode,
    });

    const openOrderResponse = await nuveiClient().openOrder({
      amount: formattedAmount,
      currency: amountPlanned.currencyCode,
      clientUniqueId: cart.id,
    });

    const sessionToken = openOrderResponse.sessionToken;
    const paymentMethod = this.getRequestedPaymentMethod(options);

    if (paymentMethod && !isSupportedPaymentMethod(paymentMethod)) {
      throw new Error(
        `Unsupported payment method "${paymentMethod}". Supported methods: ${SUPPORTED_PAYMENT_METHODS.join(", ")}.`,
      );
    }
```

**Service logging/error pattern** (lines 720-746):
```typescript
const paymentReference = await this.paymentCreationService.handleCtPaymentCreation({
  interactionId: sessionToken,
  amountPlanned,
  cart,
  paymentMethod,
});

log.info("Payment intent created successfully.", {
  cartId: cart.id,
  sessionToken: this.redactToken(sessionToken),
  paymentReference,
});

return {
  cartId: cart.id,
  sessionToken,
  paymentReference,
  merchantReturnUrl,
};
} catch (error) {
  log.error("Error creating payment intent", {
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
```

**Planner instruction:** move method extraction and validation to the first lines of `createPaymentIntent()`, before cart reads if feasible and definitely before Nuvei `openOrder()` and CT Payment creation. Replace first-key behavior with exact one-method validation. Throw structured safe setup errors for malformed/unsupported inputs and log redacted diagnostics.

---

### `processor/src/services/ct-payment-creation.service.ts` (service, CRUD / request-response)

**Analog:** `processor/src/services/ct-payment-creation.service.ts`

**Imports pattern** (lines 1-8):
```typescript
import {
  Cart,
  CommercetoolsCartService,
  CommercetoolsPaymentService,
} from "@commercetools/connect-payments-sdk";
import { PaymentTransactions } from "../dtos/operations/payment-intents.dto.js";
import { getConfig } from "../config/config.js";
import { log } from "../libs/logger/index.js";
import { NUVEI_PAYMENT_INTERFACE } from "../constants.js";
```

**Display name mapping pattern** (lines 15-17):
```typescript
const METHOD_NAMES: Record<string, string> = {
  card: "Nuvei card",
};
```

**CT payment creation pattern** (lines 40-63):
```typescript
const paymentMethod = opts.paymentMethod ?? "nuvei";
const response = await this.ctPaymentService.createPayment({
  amountPlanned: opts.amountPlanned,
  interfaceId: opts.interactionId,
  paymentMethodInfo: {
    paymentInterface: NUVEI_PAYMENT_INTERFACE,
    method: paymentMethod,
    name: { en: METHOD_NAMES[paymentMethod] ?? "Nuvei" },
  },
  ...(opts.cart.customerId
    ? { customer: { typeId: "customer", id: opts.cart.customerId } }
    : opts.cart.anonymousId
      ? { anonymousId: opts.cart.anonymousId }
      : null),
  transactions: [
```

**Cart association and logging pattern** (lines 68-82):
```typescript
await this.ctCartService.addPayment({
  resource: {
    id: opts.cart.id,
    version: opts.cart.version,
  },
  paymentId,
});

log.info("Commercetools Payment and initial transaction created.", {
  ctCartId: opts.cart.id,
  ctPaymentId: paymentId,
  interactionId: opts.interactionId,
});
```

**Planner instruction:** derive display names from the processor registry if registry includes `displayName`. Add only evidence-backed names (`card`, transitional `embedded` if retained). Do not add unproven PSP request metadata here.

---

### `processor/src/routes/nuvei-payment.route.ts` (route / controller, request-response)

**Analog:** `processor/src/routes/nuvei-payment.route.ts`

**Imports pattern** (lines 1-18):
```typescript
import { SessionHeaderAuthenticationHook } from "@commercetools/connect-payments-sdk";
import { Type } from "@sinclair/typebox";
import { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  PaymentResponseSchema,
  PaymentResponseSchemaDTO,
  PaymentMethodOptionsSchema,
  PaymentMethodOptionsSchemaDTO,
  PaymentConfirmRequestSchema,
  PaymentConfirmRequestSchemaDTO,
} from "../dtos/nuvei-payment.dto.js";
```

**Authenticated GET/POST route pattern** (lines 43-76):
```typescript
fastify.get<{ Reply: PaymentResponseSchemaDTO }>(
  "/",
  {
    preHandler: [opts.sessionHeaderAuthHook.authenticate()],
    schema: {
      response: {
        200: PaymentResponseSchema,
      },
    },
  },
  async (_, reply) => {
    const resp = await opts.paymentService.createPaymentIntent();
    return reply.status(200).send(resp);
  },
);

fastify.post<{ Body: PaymentMethodOptionsSchemaDTO; Reply: PaymentResponseSchemaDTO }>(
  "/",
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
    const resp = await opts.paymentService.createPaymentIntent(request.body);
    return reply.status(200).send(resp);
  },
);
```

**Route-local safe error pattern analog** (webhook lines 137-153):
```typescript
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
  });
  return reply.status(500).send({ error: "Processing failed." });
}
```

**Planner instruction:** keep session auth hooks. Add `4xx` response schema for structured safe setup errors on POST `/payments` if route handles them directly. If relying on global error handler, ensure thrown structured setup errors are transformed into stable public `{ code, message }` rather than generic 500.

---

### `processor/test/unit/services/nuvei-payment.service.test.ts` (test, request-response)

**Analog:** `processor/test/unit/services/nuvei-payment.service.test.ts`

**Mock pattern** (lines 1-16):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentModificationStatus } from "../../../src/dtos/operations/payment-intents.dto";

const mockNuveiClientInstance = {
  settleTransaction: vi.fn(),
  voidTransaction: vi.fn(),
  refundTransaction: vi.fn(),
  openOrder: vi.fn(),
  getPaymentStatus: vi.fn(),
  isReachable: vi.fn(),
  validateDmnChecksum: vi.fn(),
};

vi.mock("../../../src/clients/nuvei.client", () => ({
  nuveiClient: () => mockNuveiClientInstance,
}));
```

**Reset pattern** (lines 163-180):
```typescript
describe("NuveiPaymentService", () => {
  beforeEach(() => {
    mockNuveiClientInstance.settleTransaction.mockReset();
    mockNuveiClientInstance.voidTransaction.mockReset();
    mockNuveiClientInstance.refundTransaction.mockReset();
    mockNuveiClientInstance.openOrder.mockReset();
    mockNuveiClientInstance.getPaymentStatus.mockReset();
    mockNuveiClientInstance.isReachable.mockReset();
    mockNuveiClientInstance.validateDmnChecksum.mockReset();
    mockHasTransactionInState.mockReset();
    mockGetPayment.mockReset();
    mockUpdatePayment.mockReset();
    mockGetCart.mockReset();
    mockGetPaymentAmount.mockReset();
    mockHandleCtPaymentCreation.mockReset();
    mockHandleCtPaymentCreation.mockResolvedValue("payment-ref-1");
  });
```

**Advertisement test pattern** (lines 288-298):
```typescript
describe("getSupportedPaymentComponents()", () => {
  it("returns embedded dropin and card component", async () => {
    const { service } = createService();
    const result = await service.getSupportedPaymentComponents();
    expect(result.dropins).toContainEqual({ type: "embedded" });
    expect(result.components).toContainEqual({ type: "card" });
    expect(result.express).toEqual([]);
  });
});
```

**Create-payment side-effect test pattern to extend** (lines 466-553):
```typescript
describe("createPaymentIntent()", () => {
  it("passes paymentMethod 'card' when paymentMethodOptions contains card", async () => {
    const { service } = createService();

    mockGetCart.mockResolvedValue({ id: "cart-1", version: 1 });
    mockGetPaymentAmount.mockResolvedValue({ centAmount: 1000, currencyCode: "USD" });
    mockNuveiClientInstance.openOrder.mockResolvedValue({ sessionToken: "st-card" });

    await service.createPaymentIntent({ paymentMethodOptions: { card: {} } });

    expect(mockHandleCtPaymentCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: "card",
      }),
    );
  });

  it("throws for unsupported payment method", async () => {
    const { service } = createService();

    mockGetCart.mockResolvedValue({ id: "cart-1", version: 1 });
    mockGetPaymentAmount.mockResolvedValue({ centAmount: 1000, currencyCode: "USD" });
    mockNuveiClientInstance.openOrder.mockResolvedValue({ sessionToken: "st-wechat" });

    await expect(
      service.createPaymentIntent({ paymentMethodOptions: { wechatpay: { flow: "qrcode" } } }),
    ).rejects.toThrow('Unsupported payment method "wechatpay"');

    expect(mockHandleCtPaymentCreation).not.toHaveBeenCalled();
  });
});
```

**Planner instruction:** extend this exact test style to assert unsupported and malformed inputs reject with structured error code/message and do **not** call `mockNuveiClientInstance.openOrder` or `mockHandleCtPaymentCreation`. Add multi-key, non-object, empty options, valid `card`, and valid transitional `embedded` cases.

---

### `processor/test/unit/routes/operation.route.test.ts` (test, request-response)

**Analog:** `processor/test/unit/routes/operation.route.test.ts`

**Route DTO mock pattern** (lines 1-37):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@commercetools/connect-payments-sdk", () => ({
  SessionHeaderAuthenticationHook: class {
    authenticate = () => async () => {};
  },
  Oauth2AuthenticationHook: class {
    authenticate = () => async () => {};
  },
  JWTAuthenticationHook: class {
    authenticate = () => async () => {};
  },
  AuthorityAuthorizationHook: class {
    authorize =
      (..._perms: string[]) =>
      async () => {};
  },
}));

vi.mock("../../../src/dtos/operations/payment-components.dto", () => ({
  SupportedPaymentComponentsSchema: { type: "object" },
}));
```

**Payment service mock data pattern** (lines 112-140):
```typescript
describe("operation routes", () => {
  const paymentService = {
    config: vi.fn(),
    status: vi.fn(),
    getSupportedPaymentComponents: vi
      .fn()
      .mockResolvedValue({ dropins: [], components: [], express: [] }),
    modifyPayment: vi.fn(),
    handleTransaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    paymentService.config.mockResolvedValue({
      environment: "test",
      merchantId: "m1",
      merchantSiteId: "s1",
    });
    paymentService.status.mockResolvedValue({ status: "UP" });
    paymentService.getSupportedPaymentComponents.mockResolvedValue({
      dropins: [{ type: "embedded" }],
      components: [{ type: "card" }],
      express: [],
    });
```

**Route assertion pattern** (lines 216-229):
```typescript
it("registers route and returns expected component list", async () => {
  const componentsRoute = app.routes.find((r) => r.url === "/payment-components");
  expect(componentsRoute).toBeDefined();
  expect(componentsRoute!.method).toBe("GET");

  const reply = makeReply();
  await componentsRoute!.handler({}, reply);

  expect(paymentService.getSupportedPaymentComponents).toHaveBeenCalledOnce();
  expect(reply.send).toHaveBeenCalledWith({
    dropins: [{ type: "embedded" }],
    components: [{ type: "card" }],
    express: [],
  });
```

**Planner instruction:** use this route test structure for `/payment-components` after registry derivation. If adding `processor/test/unit/routes/nuvei-payment.route.test.ts`, mirror this lightweight route registration/handler style rather than standing up the full server.

---

### `enabler/test/unit/payment-enabler.test.ts` (test, request-response validation)

**Analog:** `enabler/test/unit/payment-enabler.test.ts`

**Imports pattern** (lines 1-9):
```typescript
import { describe, expect, it } from "vitest";
import { NuveiEnabler } from "../../src/index";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";
import {
  PaymentMethod,
  SUPPORTED_PAYMENT_METHODS,
  validateEnablerOptions,
} from "../../src/payment-enabler/payment-enabler";
```

**Options factory pattern** (lines 11-18):
```typescript
function makeEnablerOptions(overrides: Partial<EnablerOptions> = {}): EnablerOptions {
  return {
    processorUrl: "https://processor.example.com",
    sessionId: "session-123",
    merchantId: "merchant-123",
    merchantSiteId: "site-456",
    env: "test",
    ...overrides,
  };
}
```

**Validation assertion pattern** (lines 25-35):
```typescript
describe("validateEnablerOptions", () => {
  it("does not throw for valid options", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions())).not.toThrow();
  });

  // processorUrl
  it("throws when processorUrl is empty", () => {
    expect(() => validateEnablerOptions(makeEnablerOptions({ processorUrl: "" }))).toThrow(
      'Invalid EnablerOptions: "processorUrl" is required and must be a non-empty string URL.',
    );
  });
```

**Planner instruction:** update assertions to check stable structured error properties (`code`, safe `message`) instead of only raw string messages. Add registry tests for `card` and transitional `embedded`/drop-in alignment.

---

### `enabler/test/unit/card.test.ts` and `enabler/test/unit/dropin.test.ts` (test, request-response)

**Analogs:** `enabler/test/unit/card.test.ts`, `enabler/test/unit/dropin.test.ts`

**Hoisted mock pattern** (`card.test.ts` lines 1-23):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EnablerOptions } from "../../src/payment-enabler/payment-enabler";

const mockLoadNuveiSdk = vi.hoisted(() => vi.fn());
const mockCreatePayment = vi.hoisted(() => vi.fn());
const mockGetPayment = vi.hoisted(() => vi.fn());
const mockConfirmPayment = vi.hoisted(() => vi.fn());
const mockConfirmPaymentResult = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/nuvei-sdk", () => ({
  loadNuveiSdk: mockLoadNuveiSdk,
}));

vi.mock("../../src/services/api-service", () => ({
  apiService: vi.fn(() => ({
    createPayment: mockCreatePayment,
    getPayment: mockGetPayment,
    confirmPayment: mockConfirmPayment,
  })),
  confirmPaymentResult: mockConfirmPaymentResult,
}));
```

**Card method request assertion** (`card.test.ts` lines 64-82):
```typescript
component.mount("#container");

// loadNuveiSdk and createPayment are invoked synchronously before the
// first await inside init(), so they are called immediately.
expect(mockLoadNuveiSdk).toHaveBeenCalled();
expect(mockCreatePayment).toHaveBeenCalledWith({
  paymentMethodOptions: { card: {} },
});
```

**Drop-in method request analog** (`dropin.test.ts` lines 55-78):
```typescript
mockCreatePayment.mockResolvedValue({
  sessionToken: "st-123",
  paymentReference: "payment-ref-123",
});

const builder = new DropinEmbeddedBuilder(makeEnablerOptions());
const dropin = builder.build({ showPayButton: true });

dropin.mount("#container");
await vi.waitFor(() =>
  expect(mockSfcCreatePayment).toHaveBeenCalledWith(
    expect.objectContaining({
      sessionToken: "st-123",
      merchant_unique_id: "payment-ref-123",
    }),
  ),
);
```

**Planner instruction:** add explicit drop-in create-payment assertion matching the final registry key (`embedded` preferred, or documented alias). Keep Vitest hoisted mocks; they already isolate SDK and processor calls without project-wide commands.

## Shared Patterns

### TypeScript ESM imports
**Source:** all source files above
**Apply to:** all new/modified TS files
```typescript
import { Something } from "../relative/path.js";
import type { SomeType } from "../relative/path.js";
```
Use `.js` extensions in runtime source imports; tests currently import without `.js` from `src` paths.

### TypeBox boundary schemas
**Source:** `processor/src/dtos/nuvei-payment.dto.ts`, `processor/src/dtos/operations/payment-components.dto.ts`
**Apply to:** processor request/response DTOs
```typescript
import { Static, Type } from "@sinclair/typebox";

export const SomeSchema = Type.Object({
  field: Type.String({ minLength: 1 }),
});

export type SomeSchemaDTO = Static<typeof SomeSchema>;
```

### Authenticated Fastify routes
**Source:** `processor/src/routes/nuvei-payment.route.ts` lines 43-76 and `processor/src/routes/operation.route.ts` lines 71-82
**Apply to:** `/payments`, `/payment-components`
```typescript
preHandler: [opts.sessionHeaderAuthHook.authenticate()],
schema: {
  body: PaymentMethodOptionsSchema,
  response: { 200: PaymentResponseSchema },
},
```
Use `jwtAuthHook.authenticate()` for operation routes, as existing `/payment-components` does.

### Safe route error handling
**Source:** `processor/src/routes/nuvei-payment.route.ts` lines 137-153
**Apply to:** processor setup errors
```typescript
log.error("Error processing Nuvei DMN", {
  error: error instanceof Error ? error.message : "Unknown error",
});
return reply.status(500).send({ error: "Processing failed." });
```
For Phase 1 setup errors, adapt this to `{ code, message }` with `400`/`422`, keeping richer details only in redacted logs.

### No-external-state validation gate
**Source:** `processor/src/services/nuvei-payment.service.ts` lines 685-718
**Apply to:** `createPaymentIntent()`
```typescript
const paymentMethod = this.getRequestedPaymentMethod(options);
if (paymentMethod && !isSupportedPaymentMethod(paymentMethod)) {
  throw new Error(...);
}
```
Move this validation before `nuveiClient().openOrder()` and before `handleCtPaymentCreation()`. Replace helper with one that rejects zero/ambiguous/malformed unsupported cases according to the Phase 1 error contract.

### Vitest mocking/reset style
**Source:** `processor/test/unit/services/nuvei-payment.service.test.ts` lines 1-16, 163-180; `enabler/test/unit/card.test.ts` lines 1-23
**Apply to:** all Phase 1 tests
```typescript
const mockThing = vi.hoisted(() => vi.fn());
vi.mock("../../src/module", () => ({ thing: mockThing }));

beforeEach(() => {
  vi.clearAllMocks();
});
```
Use behavior assertions on side effects (`not.toHaveBeenCalled`) rather than implementation plumbing.

## No Analog Found

None. Every likely Phase 1 file has an exact or role-match analog in the existing codebase. Optional new files (`method-registry.ts`, `payment-errors.dto.ts`, new route/contract tests) should copy the small DTO/registry/test patterns listed above.

## Metadata

**Analog search scope:** `enabler/src`, `enabler/test/unit`, `processor/src/dtos`, `processor/src/services`, `processor/src/routes`, `processor/test/unit`
**Files scanned:** 18
**Pattern extraction date:** 2026-06-02
