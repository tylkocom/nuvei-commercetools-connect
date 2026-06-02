# Testing Patterns

**Analysis Date:** 2026-06-02

## Test Framework

**Runner:**
- Vitest `^4.1.5` in both application packages: `enabler/package.json` and `processor/package.json`.
- Enabler config: `enabler/vitest.config.ts`.
- Processor config: `processor/vitest.config.ts`.
- Both configs use `globals: true`, `environment: "node"`, and `include: ["test/**/*.test.ts"]`.

**Assertion Library:**
- Vitest `expect` from `vitest` is used for assertions in `enabler/test/unit/api-service.test.ts`, `processor/test/unit/clients/nuvei.client.test.ts`, and `processor/test/unit/services/nuvei-event.converter.test.ts`.
- Vitest mock utilities `vi`, `beforeEach`, `afterEach`, and `vi.waitFor` are imported from `vitest` where needed: `enabler/test/unit/card.test.ts`, `enabler/test/unit/nuvei-sdk.test.ts`, `processor/test/unit/routes/nuvei-payment.route.test.ts`.

**Run Commands:**
```bash
npm run test --prefix enabler                 # Run all enabler tests through enabler/scripts/run-vitest.mjs
npm run test --prefix processor               # Run all processor tests through processor/scripts/run-vitest.mjs
npm run test --prefix enabler -- --watch      # Watch mode through forwarded Vitest args
npm run test --prefix processor -- --watch    # Watch mode through forwarded Vitest args
npm run test --prefix enabler -- --coverage   # Generate enabler coverage with @vitest/coverage-v8
npm run test --prefix processor -- --coverage # Generate processor coverage with @vitest/coverage-v8
```

`enabler/scripts/run-vitest.mjs` and `processor/scripts/run-vitest.mjs` always invoke `vitest run`, forward most CLI arguments, ignore legacy `--collectCoverageFrom`, and translate legacy `--coverageReporters` to `--coverage.reporter`.

## Test File Organization

**Location:**
- Enabler tests live under `enabler/test/unit/` and test `enabler/src/` modules.
- Processor tests live under `processor/test/unit/` and test `processor/src/` modules.
- Local manual/mock harness assets live under `testing/`: `testing/mock-commercetools-server.mjs`, `testing/nuvei-local-mock-ct-test.html`, and `testing/postman-nuvei-connector-local-testing.collection.json`.
- Tests are not co-located with source files because both Vitest configs include only `test/**/*.test.ts`.

**Naming:**
- Use `*.test.ts` for automated tests: `enabler/test/unit/payment-enabler.test.ts`, `processor/test/unit/routes/operation.route.test.ts`, `processor/test/unit/services/dmn-processing.service.test.ts`.
- Match source role in the test filename: route tests use `.route.test.ts`, service tests use `.service.test.ts`, client tests use `.client.test.ts`, and contract tests use `processor/test/unit/contract/payment-method-contract.test.ts`.
- Use `.fixtures.ts` for reusable test data: `processor/test/unit/fixtures/dmn.fixtures.ts`.

**Structure:**
```text
enabler/test/unit/
├── api-service.test.ts
├── card.test.ts
├── dropin.test.ts
├── nuvei-sdk.test.ts
└── payment-enabler.test.ts

processor/test/unit/
├── clients/nuvei.client.test.ts
├── contract/payment-method-contract.test.ts
├── fixtures/dmn.fixtures.ts
├── routes/dmn-webhook.route.test.ts
├── routes/nuvei-payment.route.test.ts
├── routes/operation.route.test.ts
├── routes/webhook.route.test.ts
└── services/
    ├── ct-payment-creation.service.test.ts
    ├── dmn-processing.service.test.ts
    ├── nuvei-event.converter.test.ts
    └── nuvei-payment.service.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLoadNuveiSdk = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/nuvei-sdk", () => ({
  loadNuveiSdk: mockLoadNuveiSdk,
}));

import { CardComponentBuilder } from "../../src/components/card";

function makeEnablerOptions(): EnablerOptions {
  return {
    processorUrl: "https://localhost:8080",
    sessionId: "session-123",
    merchantId: "merchant-123",
    merchantSiteId: "site-456",
    env: "test",
  };
}

describe("CardComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mount() initiates payment creation and SDK loading", async () => {
    const mockSfcCreatePayment = vi.fn();
    const mockSafeCharge = vi.fn().mockReturnValue({
      createPayment: mockSfcCreatePayment,
    });
    mockLoadNuveiSdk.mockResolvedValue(mockSafeCharge);

    const component = new CardComponentBuilder(makeEnablerOptions()).build({ showPayButton: true });
    component.mount("#container");

    expect(mockLoadNuveiSdk).toHaveBeenCalled();
  });
});
```

This pattern is used in `enabler/test/unit/card.test.ts` and `enabler/test/unit/dropin.test.ts`.

**Patterns:**
- Place mocks before importing the module under test when the import graph captures dependencies at module load time: `processor/test/unit/services/nuvei-payment.service.test.ts`, `processor/test/unit/routes/dmn-webhook.route.test.ts`, `enabler/test/unit/card.test.ts`.
- Use `vi.hoisted()` when mock functions must be referenced inside `vi.mock()` factories and test assertions: `enabler/test/unit/card.test.ts`, `enabler/test/unit/dropin.test.ts`.
- Use small factory helpers for repetitive setup: `makeEnablerOptions()` in `enabler/test/unit/payment-enabler.test.ts`, `makeClient()` in `processor/test/unit/clients/nuvei.client.test.ts`, `createService()` in `processor/test/unit/services/nuvei-payment.service.test.ts`, `makeReply()` in `processor/test/unit/routes/nuvei-payment.route.test.ts`.
- Use nested `describe()` blocks for method-specific client and service behavior: `processor/test/unit/clients/nuvei.client.test.ts` groups `validateDmnChecksum`, `openOrder`, `getPaymentStatus`, `settleTransaction`, and error handling.
- Assert behavior at the boundary, not internal implementation details, when a boundary is available. `processor/test/unit/routes/nuvei-payment.route.test.ts` uses both direct registered handler calls and `fastify.inject(...)` to validate Fastify request/response behavior.
- Use `await vi.waitFor(...)` for async frontend callbacks that run after `mount()`: `enabler/test/unit/card.test.ts` and `enabler/test/unit/dropin.test.ts`.
- Reset mocks in `beforeEach()` or `afterEach()` based on scope: `vi.clearAllMocks()` in component/service route tests, `vi.restoreAllMocks()` in `enabler/test/unit/api-service.test.ts`, `vi.unstubAllGlobals()` in `enabler/test/unit/nuvei-sdk.test.ts`.

## Mocking

**Framework:** Vitest `vi` mocks, spies, global stubs, and module mocks.

**Patterns:**
```typescript
const mockNuveiClientInstance = {
  openOrder: vi.fn(),
  getPaymentStatus: vi.fn(),
  settleTransaction: vi.fn(),
  voidTransaction: vi.fn(),
  refundTransaction: vi.fn(),
  validateDmnChecksum: vi.fn(),
};

vi.mock("../../../src/clients/nuvei.client", () => ({
  nuveiClient: () => mockNuveiClientInstance,
}));

vi.mock("../../../src/libs/logger/index", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));
```

This module-mocking pattern is used in `processor/test/unit/services/nuvei-payment.service.test.ts` and `processor/test/unit/services/dmn-processing.service.test.ts`.

```typescript
const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ sessionToken: "st", paymentReference: "ref" }),
});
vi.stubGlobal("fetch", fetchMock);
```

This global-stubbing pattern is used in `enabler/test/unit/api-service.test.ts`; `processor/test/unit/clients/nuvei.client.test.ts` uses `vi.spyOn(globalThis, "fetch")` with real `Response` objects.

**What to Mock:**
- Mock browser globals (`window`, `document`, `fetch`) when testing enabler SDK loading and API calls: `enabler/test/unit/nuvei-sdk.test.ts`, `enabler/test/unit/api-service.test.ts`.
- Mock external provider and commercetools SDK clients in service tests: `processor/test/unit/services/nuvei-payment.service.test.ts`, `processor/test/unit/services/dmn-processing.service.test.ts`.
- Mock logger modules when asserting safe diagnostics or avoiding test output: `processor/test/unit/routes/nuvei-payment.route.test.ts`, `processor/test/unit/services/nuvei-payment.service.test.ts`.
- Mock Fastify auth hooks and Connect SDK classes when route tests need to exercise route registration without real commercetools auth: `processor/test/unit/routes/operation.route.test.ts`, `processor/test/unit/routes/dmn-webhook.route.test.ts`.
- Use lightweight route doubles to inspect registered handlers for route-level branching: `buildApp()` in `processor/test/unit/routes/nuvei-payment.route.test.ts` and `processor/test/unit/routes/operation.route.test.ts`.

**What NOT to Mock:**
- Do not mock pure conversion logic when testing conversion behavior; instantiate `NuveiEventConverter` directly in `processor/test/unit/services/nuvei-event.converter.test.ts`.
- Do not mock the payment method registries in contract tests; `processor/test/unit/contract/payment-method-contract.test.ts` imports both `processor/src/dtos/operations/payment-components.dto.ts` and `enabler/src/payment-enabler/method-registry.ts` to enforce real parity.
- Do not mock Fastify when validating schema-boundary behavior; `processor/test/unit/routes/nuvei-payment.route.test.ts` builds a real Fastify instance and uses `fastify.inject(...)` for the semantic validation boundary.
- Do not mock checksum generation in `NuveiClient` tests; `processor/test/unit/clients/nuvei.client.test.ts` computes checksums with `node:crypto` and verifies request bodies.

## Fixtures and Factories

**Test Data:**
```typescript
const baseDmn = {
  merchant_unique_id: "payment-1",
  TransactionID: "tx-1",
  transactionType: "Auth",
  ppp_status: "OK",
  currency: "USD",
  totalAmount: "10.00",
};

expect(() =>
  new NuveiEventConverter().convertDmnToPaymentUpdate({
    ...baseDmn,
    transactionType: "UnexpectedType",
  }),
).toThrow("Unsupported Nuvei transactionType: UnexpectedType");
```

This inline fixture pattern is used in `processor/test/unit/services/nuvei-event.converter.test.ts`.

```typescript
export const dmnAuthOk: Record<string, unknown> = baseDmnFields({
  transactionType: "Auth",
  ppp_status: "OK",
  Status: "APPROVED",
});

export function makeDmnMockPayment(overrides: Partial<MockPayment> = {}): MockPayment {
  return {
    id: "payment-1",
    interfaceId: "session-token-1",
    amountPlanned: { centAmount: 1000, currencyCode: "USD" },
    transactions: [],
    ...overrides,
  };
}
```

This shared fixture/factory pattern is used in `processor/test/unit/fixtures/dmn.fixtures.ts`.

**Location:**
- Shared processor DMN fixtures live in `processor/test/unit/fixtures/dmn.fixtures.ts`.
- Most simple factories remain local to the test file that uses them: `makeEnablerOptions()` in `enabler/test/unit/card.test.ts`, `makeReply()` in `processor/test/unit/routes/nuvei-payment.route.test.ts`, `makeMockPayment()` in `processor/test/unit/services/nuvei-payment.service.test.ts`.
- No global test setup file is configured in `enabler/vitest.config.ts` or `processor/vitest.config.ts`.

## Coverage

**Requirements:** No coverage thresholds are configured in `enabler/vitest.config.ts`, `processor/vitest.config.ts`, `enabler/package.json`, or `processor/package.json`.

**View Coverage:**
```bash
npm run test --prefix enabler -- --coverage
npm run test --prefix processor -- --coverage
```

Both packages include `@vitest/coverage-v8` `^4.1.5` in `enabler/package.json` and `processor/package.json`. The wrapper scripts in `enabler/scripts/run-vitest.mjs` and `processor/scripts/run-vitest.mjs` support forwarded coverage args and `--coverage.reporter` translation.

## Test Types

**Unit Tests:**
- Enabler unit tests cover API request construction, public enabler validation, method registry behavior, SDK loading, card component behavior, and drop-in behavior: `enabler/test/unit/api-service.test.ts`, `enabler/test/unit/payment-enabler.test.ts`, `enabler/test/unit/nuvei-sdk.test.ts`, `enabler/test/unit/card.test.ts`, `enabler/test/unit/dropin.test.ts`.
- Processor unit tests cover Nuvei client signing/checksum behavior, routes, payment service operations, DMN conversion/processing, commercetools payment creation, and payment method contract parity: `processor/test/unit/clients/nuvei.client.test.ts`, `processor/test/unit/routes/operation.route.test.ts`, `processor/test/unit/services/nuvei-payment.service.test.ts`, `processor/test/unit/services/dmn-processing.service.test.ts`, `processor/test/unit/contract/payment-method-contract.test.ts`.

**Integration Tests:**
- Route boundary tests use Fastify injection for selected behavior: `buildFastifyApp()` and `fastify.inject(...)` in `processor/test/unit/routes/nuvei-payment.route.test.ts`.
- Contract tests exercise real processor/enabler registry exports and enabler builder creation across package boundaries: `processor/test/unit/contract/payment-method-contract.test.ts`.
- Local manual integration harness exists under `testing/`; start it with `npm start --prefix testing` from `testing/package.json`. The harness server is `testing/mock-commercetools-server.mjs` and the browser exercise page is `testing/nuvei-local-mock-ct-test.html`.

**E2E Tests:**
- No automated E2E framework is configured in `enabler/package.json`, `processor/package.json`, `testing/package.json`, or the package Vitest configs.
- Manual/local scenario coverage is documented in `docs/TESTING.md`, `docs/TEST_SCENARIOS.md`, and `testing/nuvei-local-mock-ct-test.md`.

## Common Patterns

**Async Testing:**
```typescript
component.mount("#container");

await vi.waitFor(() =>
  expect(mockSfcCreatePayment).toHaveBeenCalledWith(
    expect.objectContaining({
      sessionToken: "st-123",
      merchant_unique_id: "payment-ref-123",
    }),
  ),
);
```

Use this for async callbacks triggered from frontend component mounting, as in `enabler/test/unit/card.test.ts` and `enabler/test/unit/dropin.test.ts`.

```typescript
await expect(
  apiService({ baseApi: "https://processor.example.com", sessionId: "s" }).createPayment(),
).rejects.toThrow("Failed to create payment: 500 Internal Server Error");
```

Use this for promise rejection assertions, as in `enabler/test/unit/api-service.test.ts`.

```typescript
const response = await fastify.inject({
  method: "POST",
  url: "/",
  payload: {
    paymentMethodOptions: {
      wechatpay: {
        token: "secret",
      },
    },
  },
});

expect(response.statusCode).toBe(422);
expect(JSON.parse(response.body)).toEqual({
  code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
  message: "Payment method is not supported.",
});
```

Use this for HTTP boundary behavior, as in `processor/test/unit/routes/nuvei-payment.route.test.ts`.

**Error Testing:**
```typescript
expect(() =>
  new NuveiEventConverter().convertDmnToPaymentUpdate({
    ...baseDmn,
    currency: "UNKNOWN",
  }),
).toThrow("Unsupported currency in DMN: UNKNOWN");
```

Use synchronous `toThrow` assertions for pure validation/conversion failures in `processor/test/unit/services/nuvei-event.converter.test.ts`.

```typescript
paymentService.createPaymentIntent.mockRejectedValue(
  new PaymentSetupError(PublicPaymentErrorCode.METHOD_UNSUPPORTED, {
    category: "method_unsupported",
    requestedMethod: "wechatpay",
  }),
);

await postRoute?.handler(
  { body: { paymentMethodOptions: { wechatpay: { token: "secret" } } } },
  reply,
);

expect(reply.status).toHaveBeenCalledWith(422);
expect(Object.keys(reply.sent[0] as Record<string, unknown>).sort()).toEqual(["code", "message"]);
expect(log.warn).not.toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({ paymentMethodOptions: expect.anything() }),
);
```

Use this safe-error pattern for route tests that must prove errors do not leak request payloads, as in `processor/test/unit/routes/nuvei-payment.route.test.ts`.

---

*Testing analysis: 2026-06-02*
