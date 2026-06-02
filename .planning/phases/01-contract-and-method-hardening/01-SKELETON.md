# Walking Skeleton — Nuvei commercetools Connector

**Phase:** 1
**Generated:** 2026-06-02
**Mode:** MVP walking skeleton for an existing connector

## Capability Proven End-to-End

A Checkout browser enabler can request only a supported Nuvei payment method from the processor, and the processor can reject invalid setup before Nuvei `openOrder` or commercetools Payment creation.

## Existing Minimal End-to-End Contract Path

| Step | Existing Component | Contract Role | Phase 1 Protection Added |
|---|---|---|---|
| 1 | `NuveiEnabler` in `enabler/src/index.ts` | Validates constructor options and creates card/drop-in builders | Structured safe config and unsupported-method errors before any builder side effects. |
| 2 | `CardComponentBuilder` / `DropinEmbeddedBuilder` | Builds browser payment UI and calls processor `POST /payments` | Registry-derived method keys: `card` and transitional `embedded`. |
| 3 | `apiService().createPayment` | Sends `paymentMethodOptions` to processor | Preserves safe processor `{ code, message }` setup errors for callers. |
| 4 | `POST /payments` in `processor/src/routes/nuvei-payment.route.ts` | Authenticated browser payment creation boundary | TypeBox schema plus safe setup error response contract. |
| 5 | `NuveiPaymentService.createPaymentIntent` | Reads cart/amount, calls Nuvei `openOrder`, then creates CT Payment | Validates method options before Nuvei or commercetools payment state is created. |
| 6 | `GET /payment-components` | Advertises supported Checkout payment UI options | Registry-derived advertisement limited to buildable/processable `card` and transitional `embedded`. |

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Connector shape | Keep existing two-app Connect connector: `enabler` browser asset plus `processor` backend service | Matches repository and commercetools payment connector responsibilities. |
| Method contract | Mirrored package-local registries in enabler and processor | D-05 explicitly avoids a shared package/module in Phase 1; D-06 requires parity tests to prevent drift. |
| Supported Phase 1 methods | `card` component and transitional `embedded` drop-in | Card is the baseline; embedded remains advertised per D-08 and must receive parity/validation coverage. |
| PSP metadata | Registry shape reserves metadata fields but all Nuvei request-shaping values stay empty | D-07 requires Phase 2 sandbox evidence before Nuvei-specific request-shaping values are populated. |
| Error contract | Public setup failures expose `{ code, message }`; internal diagnostics must be redacted | D-01 through D-03 require stable safe errors and richer redacted logs. |
| Side-effect gate | Processor validates payment setup before Nuvei `openOrder` and before CT Payment creation | D-04 and CONT-02/CONT-05 prohibit external payment state for invalid setup. |
| Tests | Package-local Vitest unit/contract tests | Existing repository pattern; no new dependencies or package strategy changes. |

## Stack Touched in Phase 1

- [x] Existing project scaffold: separate `enabler/` and `processor/` npm packages remain unchanged.
- [x] Routing: processor `/payments` and `/payment-components` contract boundaries are hardened.
- [x] Browser enabler: constructor validation and card/embedded builder selection are hardened.
- [x] External state boundary: invalid setup is blocked before Nuvei `openOrder` and CT Payment creation.
- [x] Tests: enabler unit tests, processor route/service tests, and cross-package parity tests define the executable skeleton.
- [ ] Database/storage migration: none; Phase 1 does not migrate historical Payments or Nuvei sessions.
- [ ] Deployment: none; package-local test commands are the Phase 1 verification boundary.

## Artifacts This Phase Produces

| Artifact | Producer Plan | Purpose |
|---|---|---|
| `enabler/src/payment-enabler/method-registry.ts` | `01-01-PLAN.md` | Enabler mirrored method registry and helpers. |
| `processor/src/dtos/operations/payment-components.dto.ts` registry exports | `01-02-PLAN.md` | Processor mirrored method registry, supported-method checks, and advertisement schema. |
| `processor/src/dtos/operations/payment-errors.dto.ts` | `01-02-PLAN.md` | Processor public safe setup error schema/constants. |
| `PaymentSetupError` / `PublicPaymentErrorCode` / `PublicPaymentError` equivalents | `01-01-PLAN.md`, `01-02-PLAN.md` | Stable public setup error contract in each package. |
| `validatePaymentMethodOptions` equivalent | `01-02-PLAN.md` | Processor service gate before Nuvei and CT Payment side effects. |
| `processor/test/unit/contract/payment-method-contract.test.ts` | `01-03-PLAN.md` | Executable parity test across processor and enabler method contracts. |

## Out of Scope for This Skeleton

- Nuvei sandbox evidence for DMNs, 3DS, capture, cancel authorization, refund, and correlation fields.
- Final Nuvei request-shaping metadata for method-specific payloads.
- Wallets, APMs, express payments, stored payment methods, and chargeback handling.
- Production readiness claims, deployment validation, CI, and operational runbooks.
- Historical payment/session migration.

## Subsequent Slice Plan

- Phase 2: Capture real Nuvei sandbox and commercetools Checkout evidence for card authorization, 3DS, operations, duplicates, and mismatch behavior.
- Phase 3: Lock processor reconciliation so DMNs, frontend confirmation, and Payment Intents operations mutate exactly the right commercetools Payment.
- Phase 4: Replace hardcoded browser/payment data with validated Checkout, cart, shopper, billing, return URL, locale, and origin inputs.
- Phase 5: Harden shopper-facing frontend resilience and security behavior.
- Phase 6: Add repeatable local fixtures, mock scenarios, and CI gates.
- Phase 7: Align deployment, operations, health checks, runbooks, and public docs with observed evidence.
- Phase 8: Add optional payment methods only when each method has method-specific evidence and parity coverage.
