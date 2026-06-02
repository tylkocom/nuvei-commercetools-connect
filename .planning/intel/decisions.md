# Synthesized Decision Intel

Source classifications consumed: 11
ADR-classified sources: 0
Locked ADR decisions: 0

No ADR-classified documents were present in this ingest set. The entries below are non-locked decision candidates extracted from DOC-classified sources and existing planning context. They are preserved for downstream traceability but must not be treated as locked ADRs.

## Non-locked decision candidates from docs

### Card-first connector scope
source: docs/IMPLEMENTATION_PLAN.md; docs/PLAN.md; docs/NEXT_STEPS_PLAN.md; .planning/PROJECT.md
status: proposed/documented; already represented in planning
scope: payment-method baseline
Decision statement: Card payments are the first production-critical baseline; wallets, APMs, express payments, and stored payment methods remain deferred until card reconciliation is stable.

### Standard Connect payment architecture
source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; .planning/PROJECT.md
status: proposed/documented; already represented in planning
scope: connector shape
Decision statement: Use a commercetools Connect payment connector shape with `enabler` browser assets and `processor` backend service. Do not use API Extensions, a standalone DMN app, or direct browser calls to commercetools Payments API.

### Source-of-truth model
source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; .planning/PROJECT.md
status: proposed/documented; already represented in planning
scope: payment state reconciliation
Decision statement: Nuvei is source of truth for payment execution state; commercetools is source of truth for carts, orders, and Payment records; DMN webhooks are the eventual-consistency mechanism for final reconciliation.

### Native commercetools Payment fields only
source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; .planning/PROJECT.md; .planning/REQUIREMENTS.md
status: proposed/documented; already represented in planning
scope: payment metadata
Decision statement: Use native Payment fields (`interfaceId`, `paymentMethodInfo`, `paymentStatus`, `transactions`) and do not introduce custom commercetools Types unless a proven future requirement changes the policy.

### Authorization-first lifecycle
source: docs/IMPLEMENTATION_PLAN.md; docs/NUVEI_SETUP.md; docs/TEST_SCENARIOS.md; docs/ARCHITECTURE.md
status: proposed/documented; already represented in planning
scope: physical-goods lifecycle
Decision statement: Checkout authorizes first; capture, cancel authorization, and refund are performed later through Payment Intents operations and reconciled through Nuvei/DMN state.

### Mirrored method registries for current phase
source: .planning/phases/01-contract-and-method-hardening/01-CONTEXT.md; .planning/STATE.md
status: phase decision; already represented in planning
scope: phase 1 method support
Decision statement: Processor and enabler keep mirrored registries protected by parity tests rather than introducing a shared package immediately.

### Embedded drop-in transitional support
source: .planning/phases/01-contract-and-method-hardening/01-CONTEXT.md; .planning/STATE.md; docs/NEXT_STEPS_PLAN.md; docs/TEST_SCENARIOS.md
status: phase decision; conflicting terminology in docs noted in conflict report
scope: supported payment methods
Decision statement: `embedded` remains exposed as transitional drop-in support alongside `card`; `dropin` is not a processor payment method alias in current planning.

### Browser polling owns pending confirmation cadence
source: docs/PAYMENT_CONFIRMATION_POLLING.md; .planning/REQUIREMENTS.md
status: proposed/documented; represented as future frontend/security requirements
scope: browser payment confirmation
Decision statement: Browser/enabler owns bounded polling cadence; processor remains stateless and performs one authoritative status/reconciliation attempt per request; pending is a first-class outcome.

### Package manager strategy remains unsettled across docs
source: docs/PLAN.md; docs/TEST_SCENARIOS.md; docs/DEPLOYMENT.md; docs/TESTING.md; docs/IMPLEMENTATION_PLAN.md; docs/OPERATIONS.md; docs/ARCHITECTURE.md; .planning/PROJECT.md; .planning/STATE.md
status: conflicting; warning in conflict report
scope: install/build/deploy commands
Decision statement: Current planning records package-local npm lockfiles and no root package manifest/pnpm lockfile, while several docs prescribe pnpm. Downstream routing must preserve the conflict instead of silently choosing stale docs.
