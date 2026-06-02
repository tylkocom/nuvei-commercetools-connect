# Phase 01: Contract and Method Hardening - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 hardens the Checkout-facing and processor-facing payment setup contract before any external payment state is created. It covers enabler option validation, processor payment creation validation, supported method alignment for `card` and transitional `embedded` drop-in, advertised component correctness, and safe actionable errors for invalid setup.

This phase does not decide final Nuvei DMN correlation, 3DS behavior, billing/shopper data sourcing, or production readiness. Those remain later phases.

</domain>

<decisions>
## Implementation Decisions

### Error Contract

- **D-01:** Public invalid/unsupported setup errors should use a stable structured shape: an error code plus a safe human-readable message.
- **D-02:** Public responses should stay safe and minimal; internal logs should include richer redacted diagnostics such as route, correlation IDs, requested method, and validation failure category.
- **D-03:** Phase 1 should establish stable error-code categories for config, unsupported method, malformed request, and auth/session failures.
- **D-04:** Invalid enabler config, unsupported methods, and malformed processor payment requests must fail before Nuvei `openOrder` or commercetools Payment creation. No external state is created for invalid setup.

### Method Registry

- **D-05:** Phase 1 should keep processor and enabler registries mirrored rather than introducing a shared package/module immediately.
- **D-06:** Mirrored registries must be protected by a contract parity test that proves processor advertised methods, processor supported methods, and enabler-supported builders stay aligned.
- **D-07:** Registry entries should be shaped to support full PSP metadata in the future, but Phase 1 should populate only evidence-backed basics. Nuvei request-shaping details wait for Phase 2 sandbox evidence.
- **D-08:** Embedded drop-in remains exposed as supported but transitional. While exposed, it must receive the same validation and parity coverage as `card`; production-strength evidence is deferred.

### Claude's Discretion

Planner may choose the exact TypeScript structure for mirrored registries, error-code constants, and validation helpers, as long as the decisions above hold and no invalid setup creates Nuvei or commercetools state.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and phase scope

- `.planning/PROJECT.md` — Core value, active requirements, project constraints, and explicit out-of-scope boundaries.
- `.planning/REQUIREMENTS.md` — Phase 1 requirements CONT-01 through CONT-05 and traceability.
- `.planning/ROADMAP.md` — Phase 1 goal, MVP mode, success criteria, and boundary against later phases.
- `.planning/STATE.md` — Current project memory and known blockers.

### Existing code contract points

- `enabler/src/payment-enabler/payment-enabler.ts` — Current `PaymentMethod`, `SUPPORTED_PAYMENT_METHODS`, and `validateEnablerOptions` behavior.
- `enabler/src/index.ts` — Current `NuveiEnabler` component/drop-in builder dispatch and unsupported component errors.
- `processor/src/dtos/operations/payment-components.dto.ts` — Current processor `SUPPORTED_PAYMENT_METHODS`, `isSupportedPaymentMethod`, and `/payment-components` schema.
- `processor/src/dtos/nuvei-payment.dto.ts` — Current payment creation request schema accepting arbitrary `paymentMethodOptions`.
- `processor/src/services/nuvei-payment.service.ts` — Current method extraction, advertised components, and payment creation flow; note current unsupported-method validation happens after `openOrder` and must move earlier for this phase.
- `processor/src/services/ct-payment-creation.service.ts` — Current payment method display-name mapping.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `validateEnablerOptions` already validates core enabler constructor options (`processorUrl`, `sessionId`, `merchantId`, `merchantSiteId`, `env`) and can be extended or covered by stronger contract tests.
- `PaymentMethod` and enabler `SUPPORTED_PAYMENT_METHODS` already provide an enabler-side registry seed.
- Processor `SUPPORTED_PAYMENT_METHODS` and `isSupportedPaymentMethod` already provide a processor-side registry seed.
- `getSupportedPaymentComponents()` already derives component output from processor supported methods except for explicit drop-in shape.

### Established Patterns

- Enabler unsupported component/drop-in errors currently throw direct `Error` instances with readable messages.
- Processor request schemas use TypeBox.
- Processor payment creation currently accepts arbitrary method option keys and extracts the first key.
- Processor currently calls Nuvei `openOrder` before unsupported method validation, which violates the Phase 1 no-external-state-before-validation decision.

### Integration Points

- Enabler validation boundary: `NuveiEnabler` constructor and builder creation in `enabler/src/index.ts`.
- Enabler create-payment request boundary: `enabler/src/services/api-service.ts`, `enabler/src/components/card.ts`, and `enabler/src/dropin/dropin-embedded.ts`.
- Processor route/schema boundary: `processor/src/routes/nuvei-payment.route.ts` and `processor/src/dtos/nuvei-payment.dto.ts`.
- Processor registry/advertising boundary: `processor/src/dtos/operations/payment-components.dto.ts` and `NuveiPaymentService.getSupportedPaymentComponents()`.
- Processor no-external-state validation boundary: `NuveiPaymentService.createPaymentIntent()` before cart mutation, Nuvei `openOrder`, or CT Payment creation.

</code_context>

<specifics>
## Specific Ideas

- Prefer mirrored registries plus tests over a shared package/module in this phase to avoid unnecessary workspace/build restructuring.
- Registry shape may anticipate future PSP metadata, but values must not pretend to know unproven Nuvei behavior before Phase 2 sandbox evidence.
- Drop-in should be visibly transitional in code/docs/tests where practical so future agents do not treat it as equally proven production scope.

</specifics>

<deferred>
## Deferred Ideas

- Real Nuvei request-shaping metadata belongs after Phase 2 sandbox evidence.
- Final decision on long-term embedded drop-in production support belongs after sandbox evidence catches up to card.
- Wallets, APMs, express payments, and stored payment methods remain deferred to Phase 8 / v2.

</deferred>

---

*Phase: 01-Contract and Method Hardening*
*Context gathered: 2026-06-02*
