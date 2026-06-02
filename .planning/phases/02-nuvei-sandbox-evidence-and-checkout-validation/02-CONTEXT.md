# Phase 2: Nuvei Sandbox Evidence and Checkout Validation - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 gathers real Nuvei sandbox and commercetools Checkout evidence for card-first flows. It must produce sanitized, machine-readable fixtures and an index sufficient for Phase 3 reconciliation planning. This phase proves what Nuvei and Checkout actually send/return; it does not harden reconciliation except for fixing blockers that prevent evidence capture.

</domain>

<decisions>
## Implementation Decisions

### Evidence scope
- **D-01:** Phase 2 must capture evidence for all Phase 2 requirements `NUV-01` through `NUV-08`: successful card authorization, declined card authorization, 3DS frictionless approval, 3DS step-up approval, 3DS failure/abandonment, capture, cancel authorization, refund, duplicate DMN, mismatch cases, canonical field identification, Complete Checkout success, and Payment Only success.
- **D-02:** Capture/cancel/refund/duplicate/mismatch are included as evidence capture only. Phase 2 does not implement full reconciliation hardening or operation correctness beyond what is needed to observe and sanitize payloads.
- **D-03:** Missing required scenario evidence blocks Phase 2 completion. If a scenario cannot be produced because of Nuvei/commercetools/account constraints, the phase must record a blocker with exact attempts, environment, and missing prerequisite.

### Environment sequence
- **D-04:** Use local tunnel/mock harness first for maximum visibility into processor requests, Nuvei DMNs, and mock CT ledger state.
- **D-05:** After local evidence capture is working, validate real commercetools Checkout flows in both Complete Checkout and Payment Only modes.
- **D-06:** The local mock/tunnel path is allowed for fast Nuvei evidence and debugging, but it does not satisfy `NUV-07` or `NUV-08` by itself; those require real commercetools Checkout evidence.

### Evidence artifacts
- **D-07:** The primary deliverable is a sanitized fixture bundle plus an index. Narrative prose is secondary; downstream Phase 3 needs machine-readable fixtures.
- **D-08:** Store committed sanitized evidence under `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/`.
- **D-09:** Use scenario-numbered fixture naming keyed to requirement IDs, for example `evidence/NUV-01-success-auth/openOrder-response.json`, `evidence/NUV-01-success-auth/dmn-auth.json`, `evidence/NUV-01-success-auth/ct-payment-after-dmn.json`.
- **D-10:** Phase 3 may later promote selected curated fixtures into package test fixture directories; Phase 2 should not prematurely put provisional sandbox evidence into source test folders.

### Sanitization and raw captures
- **D-11:** Committed evidence must be strictly sanitized with stable aliases. Preserve correlation by replacing sensitive values deterministically, for example `sessionToken-001`, `payment-001`, `cart-001`, `ppp-001`, `transaction-001`.
- **D-12:** No committed artifact may include secrets, raw checksums, session tokens, PAN-adjacent card data, raw Nuvei credentials, CT client credentials, shopper PII, or unsanitized DMN/webhook bodies.
- **D-13:** Agents may temporarily use a gitignored raw workspace for local debugging, for example `.planning/tmp/phase-02-raw/`, but raw captures must never be committed or referenced as canonical evidence.
- **D-14:** Dropping sensitive fields entirely is allowed only when stable aliasing would still expose sensitive data; otherwise prefer aliases so correlation remains visible.

### Checkout proof requirements
- **D-15:** Complete Checkout and Payment Only success proof requires all three: Checkout UI evidence, commercetools Cart/Payment/Order ledger evidence, and Nuvei dashboard/DMN/processor evidence.
- **D-16:** JSON fixtures and the evidence index are the canonical proof. Screenshots and long log excerpts are optional unless needed to explain a blocker.
- **D-17:** Minimal human proof is enough: each scenario index row must include fixture links, aliases, pass/fail conclusion, and gaps/blockers. Do not require screenshots for every scenario.

### Canonical field conclusions
- **D-18:** Phase 2 must produce a field matrix per scenario mapping CT Payment ID, CT Payment `interfaceId`, CT cart ID, Nuvei `sessionToken`, Nuvei `PPP_TransactionID` / casing variant, optional fiscal `TransactionID`, Nuvei `clientUniqueId`, DMN `merchant_unique_id`, amount, currency, and final observed status.
- **D-19:** The field matrix must explicitly identify whether each scenario confirms, contradicts, or leaves unresolved the locked identity model from Phase 1.1.1: `Payment.interfaceId=sessionToken`, terminal `transactions[].interactionId=PPP_TransactionID`, `clientUniqueId=cartId`, and optional `TransactionID` secondary only.
- **D-20:** If real Nuvei evidence reveals a different canonical field than expected, Phase 2 must not silently adapt code. It must record the contradiction and block or route to a follow-up decision before Phase 3 planning.

### Bug handling during evidence capture
- **D-21:** Fix only bugs that block evidence capture within Phase 2.
- **D-22:** All other bugs discovered during sandbox testing must be recorded in the evidence index as fixture-backed findings with severity, scenario, observed behavior, expected behavior, and target phase.
- **D-23:** Do not turn Phase 2 into reconciliation/security/frontend resilience hardening. Phase 3 owns reconciliation correctness; Phase 5 owns frontend resilience/security; Phase 7 owns operations/docs cleanup.

### Enabler integration modes
- **D-24:** Phase 2 must explicitly evaluate both Nuvei frontend integration modes: Simply Connect and Web SDK. Current code has shifted toward Simply Connect, but the original integration intent included Web SDK, and long-term support for both is desired if evidence shows both can be made safe and compatible.
- **D-25:** Treat Simply Connect as the current implemented/default path for evidence capture because it is what the enabler currently uses.
- **D-26:** Web SDK support is not automatically implemented in Phase 2. Phase 2 must gather enough evidence to decide how Web SDK differs from Simply Connect in component generation, request shape, result callbacks, 3DS handling, browser events, DMN payloads, and canonical identifier availability.
- **D-27:** Evidence fixtures and the field matrix must label the frontend mode used for each scenario: `simply-connect` or `web-sdk`.
- **D-28:** If both modes are feasible, downstream planning should preserve a clean enabler abstraction that can support both modes without conflating their result shapes or lifecycle semantics.
- **D-29:** If Web SDK evidence cannot be captured because account setup, documentation, SDK access, or Checkout embedding constraints are missing, Phase 2 must record a blocker or follow-up decision rather than silently treating Simply Connect as the only supported frontend path.

### Claude's Discretion
- Planner may choose exact JSON schema for the evidence index and fixture metadata as long as D-07 through D-20 are satisfied.
- Planner may choose the exact local tunnel tool and raw workspace naming if it remains gitignored and documented.
- Planner may decide whether to add small helper scripts for sanitization/index validation if they reduce evidence mistakes without expanding into full test automation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement scope
- `.planning/PROJECT.md` — Core value, active sandbox evidence requirement, security constraints around sensitive payment data.
- `.planning/REQUIREMENTS.md` — Phase 2 requirements `NUV-01` through `NUV-08`; related downstream requirements `TEST-02`, `RECON-*`, `SEC-*`.
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria, dependency on Phase 1, and boundary before Phase 3 reconciliation correctness.
- `.planning/STATE.md` — Current progress and prior decisions; note it may be stale after recent executions, so downstream agents should trust phase summaries/context over old current-position text.

### Prior decisions that constrain evidence
- `.planning/phases/01-contract-and-method-hardening/01-CONTEXT.md` — `card` and transitional `embedded`; no wallet/APM expansion; invalid setup creates no Nuvei/CT state.
- `.planning/phases/01.1-processor-api-design-cleanup-and-health-endpoint/01.1-CONTEXT.md` — Current route contracts: `POST /payments/session`, `POST /payments/confirm/:id`, preserve `/payment-intents/:id` and `/webhooks/nuvei`, `/health` vs `/status` behavior.
- `.planning/phases/01.1.1-payment-confirmation-tri-state-outcome-correctness/01.1.1-CONTEXT.md` — Tri-state confirmation, `402 rejected`, optional `onPending`, and canonical PPP identity model.
- `.planning/phases/01.1.1-payment-confirmation-tri-state-outcome-correctness/01.1.1-RESEARCH.md` — Nuvei PPP/TransactionID docs research and current known limitation that official `getPaymentStatus` does not list PPP fields.
- `.planning/phases/01.1.1-payment-confirmation-tri-state-outcome-correctness/01.1.1-VERIFICATION.md` — Confirms implemented code now uses canonical PPP identity and tri-state confirmation.

### Existing docs and manual testing assets
- `docs/TEST_SCENARIOS.md` — Existing scenario list; Phase 2 should turn relevant scenarios into observed evidence, not just documentation.
- `docs/ARCHITECTURE.md` — Current API/data-flow description and PPP identity invariant; currently contains Simply Connect/Web SDK wording that Phase 2 must clarify with observed evidence.
- `testing/nuvei-local-mock-ct-test.md` — Local mock/tunnel harness guide and visibility points.
- `testing/nuvei-local-mock-ct-test.html` — Local browser harness for exercising enabler + processor + Nuvei sandbox path.
- `testing/mock-commercetools-server.mjs` — Local mock CT ledger service used before real Checkout validation.
- `testing/postman-nuvei-connector-local-testing.collection.json` — Manual API collection; useful for session/confirm/DMN/operation calls.

### Code integration points
- `enabler/src/services/nuvei-sdk.ts` — Current browser SDK loader; downstream research must distinguish the Simply Connect `checkout.js` path from older/alternate Web SDK `safecharge.js` integration patterns.
- `enabler/src/components/card.ts` — Card flow that creates session, calls Nuvei SDK, and confirms payment.
- `enabler/src/dropin/dropin-embedded.ts` — Transitional embedded flow, evidence only if retained in scenario coverage.
- `enabler/src/services/api-service.ts` — Processor API client and tri-state confirmation behavior.
- `processor/src/routes/nuvei-payment.route.ts` — `/payments/session`, `/payments/confirm/:id`, `/webhooks/nuvei` route behavior.
- `processor/src/routes/operation.route.ts` — `/payment-intents/:id` capture/cancel/refund operation route.
- `processor/src/services/nuvei-payment.service.ts` — `openOrder`, `getPaymentStatus`, confirm, DMN, capture/cancel/refund orchestration.
- `processor/src/services/converters/nuvei-event.converter.ts` — DMN fixture interpretation and canonical PPP extraction.
- `processor/src/clients/nuvei.client.ts` — Nuvei API client and checksum validation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Local mock harness under `testing/` already gives a browser page, mock CT server, Postman collection, and ledger visibility for local Nuvei evidence capture.
- Processor logs and mock CT ledger are already listed as visibility points in `testing/nuvei-local-mock-ct-test.md`.
- Existing TypeScript/Vitest tests and Phase 1.1.1 fixtures encode canonical PPP behavior; useful as a comparison against real sandbox payloads.
- Test/manual docs currently use package-local npm commands and npm lockfiles; do not introduce pnpm/yarn assumptions.
- Existing docs are inconsistent about Simply Connect vs Web SDK terminology (`checkout.js` vs `safecharge.js`). Phase 2 research must correct the mental model with observed Nuvei docs/sandbox behavior before planning any dual-mode enabler abstraction.

### Established Patterns
- Processor routes are thin and service-owned; evidence capture should prefer observing real request/response/log behavior over changing route shape.
- Nuvei API calls are centralized in `processor/src/clients/nuvei.client.ts`; any evidence logger/sanitizer should avoid spreading Nuvei protocol parsing across files.
- DMN parsing is centralized in `processor/src/services/converters/nuvei-event.converter.ts`; fixture fields should be shaped to test this converter in Phase 3.
- Evidence fixtures must identify the frontend integration mode used (`simply-connect` or `web-sdk`) because these paths may differ in component generation, result callbacks, 3DS handling, and identifier availability.

### Integration Points
- Local tunnel must expose the processor `/webhooks/nuvei` endpoint for sandbox DMNs.
- Real Checkout validation must cover both Complete Checkout and Payment Only modes, not just custom/local browser usage.
- Evidence index must bridge browser/enabler observations, processor logs, Nuvei API/DMN payloads, Nuvei dashboard state, and CT Payment ledger snapshots.

</code_context>

<specifics>
## Specific Ideas

- User initially considered narrowing scope to card authorization only, but accepted keeping all NUV-01..NUV-08 evidence in Phase 2 because the roadmap requires operation/duplicate/mismatch payload evidence.
- User wants fixture bundle + index, not a narrative-only report.
- User wants minimal human proof rather than mandatory screenshots for every scenario.
- User accepts a gitignored raw capture workspace for debugging as long as committed artifacts are sanitized.
- User identified a missing enabler integration planning dimension: Nuvei supports multiple frontend component-generation approaches (Simply Connect and Web SDK). The current implementation has shifted toward Simply Connect, but the original plan expected Web SDK; long-term design should support both if evidence validates both paths.

</specifics>

<deferred>
## Deferred Ideas

- Full reconciliation hardening, replay protection, amount/currency operation bounds, and wrong-payment protection remain Phase 3.
- Bounded frontend polling/resilience beyond exposing pending remains Phase 5.
- Deployment/runbook/readiness documentation cleanup remains Phase 7 unless a doc update is directly necessary to capture evidence safely.

</deferred>

---

*Phase: 2-nuvei-sandbox-evidence-and-checkout-validation*
*Context gathered: 2026-06-02*
