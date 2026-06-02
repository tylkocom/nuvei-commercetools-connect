---
phase: 01-contract-and-method-hardening
verified: 2026-06-02T00:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "Unsupported processor POST /payments method requests now reach semantic service validation through the actual Fastify HTTP boundary and return the public METHOD_UNSUPPORTED { code, message } response."
  gaps_remaining: []
  regressions: []
---

# Phase 1: Contract and Method Hardening Verification Report

**Phase Goal:** Checkout, enabler, and processor boundaries reject invalid payment setup before external payment state is created.
**Verified:** 2026-06-02T00:00:00Z
**Status:** passed
**Re-verification:** Yes — after HTTP-boundary gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User cannot start a Nuvei card payment unless required enabler constructor options are present and valid. | ✓ VERIFIED | `NuveiEnabler` constructor calls `validateEnablerOptions(opts)` before storing options or creating builders. `validateEnablerOptions` rejects invalid `processorUrl`, `sessionId`, `merchantId`, `merchantSiteId`, and `env` with `PaymentSetupError` code `CONFIG_INVALID`. Enabler builder support is registry-derived. |
| 2 | User cannot create a Nuvei order or commercetools Payment from an invalid processor payment request. | ✓ VERIFIED | `NuveiPaymentService.createPaymentIntent()` calls `validatePaymentMethodOptions(options)` before `getCartIdFromContext`, cart lookup, amount lookup, `nuveiClient().openOrder`, or `handleCtPaymentCreation`. Service tests cover unsupported, multi-key, empty-key, non-object, and non-empty payload cases and assert cart/Nuvei/CT mocks are not called. |
| 3 | Processor and enabler use aligned supported-method contracts for `card` and transitional `embedded`. | ✓ VERIFIED | Enabler and processor both define `PAYMENT_METHOD_REGISTRY` with `card` component and `embedded` drop-in, `embedded.transitional: true`, and empty `pspMetadata`. Contract test imports both actual registries and compares public fields and supported keys. |
| 4 | `GET /payment-components` advertises only methods the enabler can build and the processor can process. | ✓ VERIFIED | `NuveiPaymentService.getSupportedPaymentComponents()` derives `components` and `dropins` from processor `PAYMENT_METHOD_REGISTRY`, returning `components: [{ type: "card" }]`, `dropins: [{ type: "embedded" }]`, `express: []`. Contract test builds every advertised method through `NuveiEnabler`. |
| 5 | Unsupported enabler builders and processor service method requests fail before SDK, Nuvei, or commercetools side effects. | ✓ VERIFIED | Enabler unsupported builder paths throw `METHOD_UNSUPPORTED` before component/drop-in mount, SDK load, or processor fetch. Processor service unsupported methods throw `PaymentSetupError(METHOD_UNSUPPORTED)` before cart lookup, Nuvei `openOrder`, and CT Payment creation. |
| 6 | Unsupported processor HTTP `POST /payments` method requests return an actionable safe public error with no external state. | ✓ VERIFIED | Gap closed. `PaymentMethodOptionsSchema` now accepts `paymentMethodOptions: Type.Optional(Type.Unknown())`, so unsupported method keys are not rejected by Fastify schema validation. The route passes the body to `createPaymentIntent`; service semantic validation classifies `wechatpay` as `METHOD_UNSUPPORTED`; the route maps `PaymentSetupError` to status 422 and exact public `{ code: METHOD_UNSUPPORTED, message: "Payment method is not supported." }`. The new Fastify injection test proves an unsupported HTTP payload reaches the service and receives the public response. Service tests prove the same unsupported path has no cart, Nuvei, or CT Payment side effects. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `enabler/src/payment-enabler/method-registry.ts` | Enabler mirrored method registry and helpers. | ✓ VERIFIED | Contains deterministic `card` and `embedded` entries, kind separation, transitional marker, empty PSP metadata, `SUPPORTED_PAYMENT_METHODS`, and helper functions. |
| `enabler/src/payment-enabler/payment-enabler.ts` | Safe public setup error contract and constructor validation. | ✓ VERIFIED | Defines `PublicPaymentErrorCode`, `PaymentSetupError`, `toPublicError()`, `validateEnablerOptions()`, and `methodUnsupported()`. |
| `enabler/src/index.ts` | Registry-derived builder dispatch. | ✓ VERIFIED | Component/drop-in support lists derive from registry helper output; unsupported builder strings throw safe `METHOD_UNSUPPORTED`. |
| `enabler/src/components/card.ts` | Card create-payment uses registry-supported key. | ✓ VERIFIED | Mount path calls `api.createPayment({ paymentMethodOptions: { [PaymentMethod.card]: {} } })`. |
| `enabler/src/dropin/dropin-embedded.ts` | Embedded drop-in create-payment uses registry-supported key. | ✓ VERIFIED | Mount path calls `api.createPayment({ paymentMethodOptions: { [PaymentMethod.embedded]: {} } })`. |
| `enabler/src/services/api-service.ts` | Preserve processor safe errors. | ✓ VERIFIED | Non-2xx `createPayment` reads `{ code, message }` and throws `PaymentSetupError`; non-public failures become generic safe `REQUEST_MALFORMED`. |
| `processor/src/dtos/operations/payment-components.dto.ts` | Processor mirrored method registry and `/payment-components` schema. | ✓ VERIFIED | Contains `card` and transitional `embedded`, derives `SUPPORTED_PAYMENT_METHODS` and `METHOD_NAMES`. |
| `processor/src/dtos/operations/payment-errors.dto.ts` | Processor safe setup error schema/constants. | ✓ VERIFIED | Defines `PublicPaymentErrorSchema`, error codes, safe public messages, `PaymentSetupError`, and `toPublicError()`. |
| `processor/src/dtos/nuvei-payment.dto.ts` | Payment creation request schema permits semantic method validation. | ✓ VERIFIED | `PaymentMethodOptionsSchema` accepts an optional unknown `paymentMethodOptions` value at the HTTP boundary while rejecting unrelated top-level fields. This lets service validation distinguish unsupported methods from malformed payloads. |
| `processor/src/routes/nuvei-payment.route.ts` | POST `/payments` maps known setup errors to public responses. | ✓ VERIFIED | Handler calls `opts.paymentService.createPaymentIntent(request.body)` and maps `PaymentSetupError` to `error.statusCode` with `error.toPublicError()`. Response schema includes 400 and 422 `PublicPaymentErrorSchema`. |
| `processor/src/services/nuvei-payment.service.ts` | Pre-side-effect method validation and registry-derived advertisements. | ✓ VERIFIED | `validatePaymentMethodOptions()` is first in `createPaymentIntent()`; unsupported methods throw `METHOD_UNSUPPORTED`; `getSupportedPaymentComponents()` derives output from registry; service logs redacted setup diagnostics. |
| `processor/src/services/ct-payment-creation.service.ts` | Registry-derived CT display names. | ✓ VERIFIED | Prior verified artifact: uses registry-derived method display names for native `paymentMethodInfo.name`. No regression evidence found in Phase 1 re-verification scope. |
| `processor/test/unit/contract/payment-method-contract.test.ts` | Cross-package parity tests. | ✓ VERIFIED | Imports actual enabler and processor registry exports, verifies parity, advertised output, and enabler builder support. |
| `processor/test/unit/routes/nuvei-payment.route.test.ts` | Route safe error coverage including real Fastify boundary. | ✓ VERIFIED | Contains handler-level unsupported mapping and a Fastify injection test: unsupported `{ wechatpay: { token: "secret" } }` POST returns 422 `{ code: METHOD_UNSUPPORTED, message: "Payment method is not supported." }` and proves the service receives the unsupported body after schema validation. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `NuveiEnabler` constructor | `validateEnablerOptions` | Direct constructor call | WIRED | Validation happens before builders are exposed. |
| Enabler builder dispatch | Enabler method registry | `getComponentPaymentMethods()` / `getDropinPaymentMethods()` | WIRED | Unsupported builder strings throw safe `METHOD_UNSUPPORTED`. |
| Card/embedded enabler components | Processor `POST /payments` | Registry method keys in `paymentMethodOptions` | WIRED | Card sends `{ card: {} }`; embedded sends `{ embedded: {} }`. |
| Processor `POST /payments` schema | Semantic service validation | `PaymentMethodOptionsSchema` permits unknown `paymentMethodOptions` | WIRED | Unsupported method keys now pass Fastify body validation and reach `createPaymentIntent()`. |
| Processor `POST /payments` handler | `NuveiPaymentService.createPaymentIntent` | Handler passes `request.body` | WIRED | Valid and unsupported schema-passing bodies reach service validation. |
| Processor service validation | Nuvei/CT side effects | `validatePaymentMethodOptions()` before cart/openOrder/payment creation | WIRED | Invalid and unsupported service inputs fail before cart, Nuvei, or CT mocks in tests and before side-effect calls in code order. |
| Real processor HTTP unsupported method request | Public `METHOD_UNSUPPORTED` response | Fastify injection → service rejection → route mapper | WIRED | Route injection test proves unsupported `wechatpay` reaches service and returns 422 with exact public `{ code, message }`. |
| `/payment-components` | Processor registry and enabler builders | Registry-derived response + parity test | WIRED | Advertised methods exactly match buildable enabler methods. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `NuveiEnabler.createComponentBuilder/createDropinBuilder` | Supported method lists | Enabler `PAYMENT_METHOD_REGISTRY` | Yes | ✓ FLOWING |
| `CardComponent.init` | Payment session | `api.createPayment({ card: {} })` | Yes, delegated to processor | ✓ FLOWING |
| `DropinComponents.initNuveiWidget` | Payment session | `api.createPayment({ embedded: {} })` | Yes, delegated to processor | ✓ FLOWING |
| `NuveiPaymentService.getSupportedPaymentComponents` | Advertised methods | Processor `PAYMENT_METHOD_REGISTRY` | Yes | ✓ FLOWING |
| `NuveiPaymentService.createPaymentIntent` | Payment method | `validatePaymentMethodOptions(options)` | Yes for valid service inputs; unsupported service inputs fail safely | ✓ FLOWING |
| `POST /payments` unsupported method public error | Public error `{ code, message }` | HTTP body → permissive boundary schema → service semantic validation → route mapper | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

No commands were run by this verifier per assignment constraint. Observed evidence supplied by the orchestrator after the gap fix:

| Behavior | Command | Result | Status |
|---|---|---|---|
| Unsupported HTTP `POST /payments` method payload reaches semantic validation and returns public error | `cd processor && npm test -- --run test/unit/routes/nuvei-payment.route.test.ts` | Passed: 1 file, 4 tests. Includes Fastify injection test asserting unsupported `wechatpay` returns 422 `{ code: METHOD_UNSUPPORTED, message: "Payment method is not supported." }`. | PASS (observed) |
| Processor Phase 1 focused tests and build | `cd processor && npm test -- --run test/unit/services/nuvei-payment.service.test.ts test/unit/routes/nuvei-payment.route.test.ts test/unit/routes/operation.route.test.ts test/unit/contract/payment-method-contract.test.ts && npm run build` | Passed: 4 test files, 51 tests; build passed. | PASS (observed) |
| Enabler Phase 1 focused tests | `cd enabler && npm test -- --run test/unit/payment-enabler.test.ts test/unit/card.test.ts test/unit/dropin.test.ts` | Passed: 34 tests. | PASS (observed) |
| Enabler build | `cd enabler && npm run build` | Passed. | PASS (observed) |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| Conventional/declared probes | Not run | No probe execution permitted by assignment; Phase 1 plans/summaries did not require probe scripts for this slice. | SKIPPED |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| CONT-01 | 01-01 | Enabler validates required constructor options before loading Nuvei SDK or calling the processor. | ✓ SATISFIED | Constructor validation is first; invalid options throw `CONFIG_INVALID`; unsupported builder paths do not load SDK or call processor. |
| CONT-02 | 01-02 | Processor validates payment creation requests before creating Nuvei orders or commercetools Payments. | ✓ SATISFIED | Service validation is first in `createPaymentIntent`; invalid inputs reject before cart, `openOrder`, and CT payment creation. |
| CONT-03 | 01-01, 01-02, 01-03 | Processor and enabler use one shared supported-method contract for `card` and retained `embedded` drop-in mode. | ✓ SATISFIED | Mirrored package-local registries match; contract parity test imports actual exports and compares stable public fields. |
| CONT-04 | 01-02, 01-03 | `GET /payment-components` advertises only methods the enabler can build and processor can process. | ✓ SATISFIED | Service response derives from registry and contract test builds advertised `card` and `embedded` through enabler. |
| CONT-05 | 01-01, 01-02, 01-03 | Unsupported payment methods fail with actionable errors and do not create Nuvei or commercetools state. | ✓ SATISFIED | Enabler unsupported builders fail safely. Processor service unsupported methods fail before side effects. HTTP unsupported method payloads now pass schema validation into semantic validation and return public `METHOD_UNSUPPORTED` `{ code, message }`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| None | n/a | n/a | n/a | No blocker anti-patterns found in the re-verified changed files. |

### Human Verification Required

None. The prior gap and its closure are determinable from code structure, route injection coverage, and observed focused test evidence without UI or external service validation.

### Gaps Summary

No remaining Phase 1 gaps. The prior HTTP-boundary gap is closed: unsupported method keys on `POST /payments` are no longer rejected by the TypeBox route schema before semantic validation. They reach `NuveiPaymentService.validatePaymentMethodOptions()`, are classified as `METHOD_UNSUPPORTED`, return the safe public `{ code, message }` response through the actual Fastify route boundary, and do not create Nuvei or commercetools state because service validation runs before all external side effects.

---

_Verified: 2026-06-02T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
