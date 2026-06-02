# Project Research Summary

**Project:** Nuvei commercetools Connector
**Domain:** Card-first commercetools Connect payment connector for Nuvei
**Researched:** 2026-06-02
**Confidence:** HIGH for commercetools/repository direction; MEDIUM for Nuvei runtime and DMN details until sandbox evidence is captured

## Executive Summary

This is a reconciliation-first payment connector, not a broad payment-method catalog. Experts build this type of product by keeping the browser enabler thin, keeping all PSP and commercetools Payment mutation logic in the processor, and treating asynchronous PSP notifications as a first-class reconciliation path. Nuvei is the payment execution source of truth; commercetools Payment is the commerce ledger; browser callbacks are only a fast verification signal.

The recommended approach is a narrow card-first cutover: harden card authorization, Nuvei `openOrder`, frontend confirmation, DMN correlation/idempotency, 3DS behavior, capture/cancel/refund, security/logging, deployment docs, and CI before expanding to wallets/APMs/drop-in breadth. Use npm, TypeScript, Fastify, TypeBox, Vite, official commercetools SDKs, native commercetools Payment fields, structured redacted logs, and real Nuvei sandbox fixtures.

The highest risks are wrong-Payment DMN correlation, duplicate or missing commercetools transactions, browser confirmation being treated as final truth, hardcoded shopper/billing data breaking 3DS, checksum/logging mistakes, and documentation/deployment drift. Mitigate by proving Nuvei sandbox payload fields, using commercetools Payment ID as the canonical `merchant_unique_id` only after evidence confirms it round-trips, validating amount/currency/merchant/site before every mutation, making DMN processing idempotent, and deferring payment-method expansion until card reconciliation is demonstrably correct.

## Key Findings

### Recommended Stack

Keep the existing two-application commercetools Connect shape: an `assets` enabler for browser payment UI and a `service` processor for PSP operations, commercetools Payment updates, Payment Intents, and Nuvei DMNs. The current repository stack is appropriate; the roadmap should invest in contract hardening, fixture-backed reconciliation tests, deployment repeatability, and observability rather than framework replacement.

**Core technologies:**
- commercetools Connect and Checkout: connector hosting/session orchestration — matches the official payment integration template and repository shape.
- commercetools Payments API and official SDKs: Payment ledger and Payment Intents operations — use standard Payment fields for traceable transaction history.
- Nuvei REST plus Simply Connect/Web SDK: payment execution and hosted card capture — keeps PAN inside Nuvei-hosted UI and requires sandbox proof for payload fields.
- Node.js active LTS, TypeScript, ESM: processor/enabler runtime and type discipline — keep local/CI/runtime versions aligned with Connect support.
- Fastify 5 with TypeBox: processor routes and runtime schemas — suitable for low-overhead, schema-first HTTP boundaries and raw DMN validation.
- Vite library mode: enabler browser asset build — appropriate for a small static connector library, not a storefront app.
- npm with committed `package-lock.json` files: deterministic package strategy — current repo and `connect.yaml` use npm, while pnpm/root workspace docs are drift.
- Vitest plus local mock CT and real Nuvei sandbox fixtures: behavior verification — mocks cover deterministic state transitions; sandbox evidence proves Nuvei/Checkout semantics.

### Expected Features

The product must be evaluated as a production-capable card connector only when browser Checkout, processor responses, Nuvei status, DMNs, and commercetools transactions agree without unsafe or duplicate state changes.

**Must have (table stakes):**
- Card Web Component authorization through Nuvei-hosted fields.
- Complete Checkout and Payment Only support proven in real sandbox sessions.
- Nuvei `openOrder` session creation with correct amount, currency, return URL, and correlation IDs.
- Explicit supported payment method contract shared by processor, enabler, and Merchant Center output.
- Enabler and processor runtime validation before creating Nuvei orders or commercetools Payments.
- 3DS frictionless, challenge approval, failure, and abandonment handling.
- Tri-state browser confirmation: approved, rejected, pending.
- Canonical DMN correlation, checksum validation, idempotency, amount/currency validation, and out-of-order handling.
- Capture, cancel authorization, refund, reverse semantics, and explicit partial capture/refund decisions.
- Local mock testing, sandbox fixture evidence, redacted structured logging, deployment guidance, runbooks, and CI gates.

**Should have (differentiators):**
- Reconciliation-first transaction ledger behavior across frontend confirmation, Nuvei status, DMN, and operations.
- Sanitized Nuvei sandbox fixture library for auth/decline/3DS/capture/cancel/refund/duplicates/mismatches.
- Bounded browser pending-state polling.
- Typed payment method registry for future expansion.
- Merchant Center observability through native Payment fields.
- Safe shopper error taxonomy and actionable operational runbooks.

**Defer (v2+):**
- Apple Pay, Google Pay, APMs, express buttons, stored payment methods, chargeback handling beyond basic mapping, multi-capture business rules, advanced fraud/risk surfaces, and multi-region/multi-merchant routing.
- Treat embedded drop-in as transitional unless it receives the same reconciliation and sandbox evidence as card.

### Architecture Approach

Preserve strict boundaries: the enabler renders Nuvei-hosted browser components and passes the Checkout session header to the processor; the processor is the only boundary that calls Nuvei REST APIs or mutates commercetools Payments; DMN processing is the canonical eventual-consistency path. Store the Nuvei `sessionToken` as an openOrder/session identifier, promote Nuvei `transactionId` to the successful financial transaction `interactionId`, and use the commercetools Payment ID as Nuvei `merchant_unique_id` only after sandbox payloads prove it is echoed reliably.

**Major components:**
1. Enabler public API and card/drop-in builders — validate options, load Nuvei SDK, render hosted UI, call processor create/confirm endpoints.
2. Enabler API service — thin `fetch` wrapper using `X-Session-ID`; no PSP state decisions.
3. Processor payment routes — authenticated browser/session endpoints for payment creation, confirmation, and Nuvei DMN receiving.
4. Processor operation routes — Checkout operation endpoints for status/components and Payment Intents capture/cancel/refund/reverse.
5. `NuveiPaymentService` — orchestration boundary for cart amount lookup, Nuvei calls, Payment creation/update, confirmation, operations, and DMN reconciliation.
6. `NuveiEventConverter` — pure DMN-to-transaction mapping; no side effects or Payment lookup.
7. Local mock commercetools harness — deterministic connector-state validation before real Nuvei sandbox E2E.

### Critical Pitfalls

1. **Wrong-Payment DMN correlation** — avoid by requiring canonical Payment ID correlation, cart ID as secondary validation, merchant/site match, amount/currency equality, and sandbox proof of Nuvei payload fields.
2. **Duplicate, missing, or conflicting transactions** — avoid by using Nuvei financial transaction IDs for successful transaction `interactionId`s, idempotency by transaction/type/operation, and rejecting operations without the required prior transaction ID.
3. **Browser confirmation as final truth** — avoid by verifying server-side with Nuvei status, keeping DMN authoritative, and returning explicit pending where status is inconclusive.
4. **3DS failures from hardcoded shopper/billing data** — avoid by replacing hardcoded country/email with validated Checkout/cart/shopper/enabler inputs and testing both Complete Checkout and Payment Only 3DS scenarios.
5. **Checksum/logging/security mistakes** — avoid by preserving raw DMN body only for validation, locking checksum policy, allowlisting log fields, redacting tokens/checksums/PII/PAN-adjacent data, and returning safe shopper messages.
6. **Package/deployment documentation drift** — avoid by standardizing npm/package-lock commands or making a deliberate workspace cutover with docs, CI, and `connect.yaml` changed together.
7. **Payment-method expansion before card correctness** — avoid by gating wallets/APMs/drop-in production support behind method-specific Nuvei params, fixtures, statuses, reconciliation rules, and runbooks.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Contract and Method Registry Hardening
**Rationale:** Prevents invalid inputs or unsupported methods from creating external payment state and establishes stable API boundaries.
**Delivers:** Shared supported-method contract, enabler option validation, processor request validation, card/drop-in support decision, explicit Checkout/processor route expectations.
**Addresses:** Supported payment method contract, enabler validation, safe SDK setup prerequisites, docs alignment for the public contract.
**Avoids:** Unsupported method expansion, CORS/session ambiguity, raw shopper-facing errors, accidental drop-in production scope.

### Phase 2: Nuvei Sandbox Evidence and Card Checkout Validation
**Rationale:** The main unresolved risk is real Nuvei/Checkout behavior, especially DMN correlation and 3DS. Evidence must precede reconciliation claims.
**Delivers:** Captured sanitized sandbox payloads/logs for Complete Checkout, Payment Only, authorization success, decline, 3DS frictionless/challenge/failure, duplicate DMN, missing correlation, and mismatch cases.
**Addresses:** Card Web Component authorization, Checkout modes, 3DS, openOrder fields, sandbox evidence collection.
**Avoids:** Mock-only confidence, hardcoded billing surprises, wrong correlation strategy, premature production-ready claims.

### Phase 3: Processor Reconciliation Correctness
**Rationale:** This is the load-bearing core: every financial mutation must be correlated, validated, idempotent, and safe under duplicates/out-of-order events.
**Delivers:** Canonical ID policy, strict DMN validation, amount/currency checks, duplicate/out-of-order handling, frontend/DMN consistency, operation event reconciliation, rejection of ambiguous events.
**Addresses:** DMN correlation, checksum validation, idempotency, transaction identity, pending/inconclusive status mapping, capture/cancel/refund prerequisites.
**Avoids:** Wrong-Payment updates, duplicate transactions, session-token misuse for financial operations, browser-callback finality.

### Phase 4: Card Checkout Data and Metadata Correctness
**Rationale:** Once reconciliation rules are fixed, the card flow must supply safe shopper/billing data and expose only non-sensitive Payment metadata.
**Delivers:** Validated billing/shopper input model, country/email/locale/origin/return URL validation, safe native Payment metadata policy, Merchant Center display consistency.
**Addresses:** 3DS reliability, card method metadata, native commercetools field use, safe display/support data.
**Avoids:** Hardcoded billing data, sensitive metadata storage, inconsistent method labels.

### Phase 5: Frontend Resilience and Security/Logging
**Rationale:** Shopper-facing behavior and security controls must be hardened before declaring the connector operable.
**Delivers:** Tri-state confirmation, bounded pending/polling behavior, SDK loader retry after failure, SRI rotation guidance, centralized redaction, safe error taxonomy, request-size/logging safeguards.
**Addresses:** Pending confirmation semantics, frontend Nuvei SDK loading, safe errors, redacted structured logging, checksum/logging policy.
**Avoids:** False shopper failures, permanent CDN/SRI load failures, token/checksum/PII leakage.

### Phase 6: Regression Fixtures, Local Mock, and CI Gates
**Rationale:** Reconciliation behavior must be locked down with repeatable evidence and automated gates before production rollout or future expansion.
**Delivers:** Local mock CT scenarios, sanitized Nuvei fixture tests, duplicate/out-of-order/mismatch coverage, operation transaction-ID selection tests, processor/enabler install/build/test CI using npm.
**Addresses:** Local mock harness, sandbox fixture library, CI quality gates, deterministic package installs.
**Avoids:** Behavior regressions, fixture-free claims, package-manager drift.

### Phase 7: Deployment and Operational Readiness
**Rationale:** Operators need reproducible deployment, Nuvei dashboard setup, health checks, logs, and runbooks matching the actual repo and Connect environment.
**Delivers:** Correct README/deployment/testing docs, Connect deployment checklist, DMN URL/checksum setup, OAuth scope/origin/region guidance, `/status` expectations, runbooks for auth/DMN/capture/refund/outage incidents.
**Addresses:** Deployment hooks, operational status, runbooks, documentation reality, package-manager standardization.
**Avoids:** Failed deployments, unsupported manual recovery, misleading readiness claims.

### Phase 8: Optional Payment Method Expansion
**Rationale:** Only after card correctness is proven should the connector add methods that multiply async flows and DMN cases.
**Delivers:** One method at a time: method-specific Nuvei params, domain/account setup, browser flow, DMN mapping, operations support, fixtures, observability, and runbooks.
**Addresses:** Deferred wallets/APMs/express/stored methods when justified.
**Avoids:** Registry-only method support, unproven APM pending semantics, diluted card baseline.

### Phase Ordering Rationale

- Contract hardening comes first because unsupported methods and invalid options should fail before Nuvei orders or commercetools Payments are created.
- Sandbox evidence must precede final correlation decisions because Nuvei field behavior is the key medium-confidence gap.
- Processor reconciliation must be fixed before frontend polish, operations claims, CI fixtures, or method expansion because it prevents the highest-impact financial failures.
- Card data/metadata and frontend resilience follow once the financial state machine has clear semantics.
- Fixtures/CI and deployment/runbooks convert the hardened implementation into a maintainable, supportable connector.
- Payment-method expansion is last because every new method multiplies correlation, security, and operational cases.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Nuvei sandbox DMN/status/3DS payload behavior must be observed directly; documentation is insufficient for production correlation claims.
- **Phase 3:** Nuvei status taxonomy, operation DMNs, and edge ordering require API/payload research plus fixture design.
- **Phase 5:** SRI rotation, CDN/CSP behavior, checksum payload variants, and safe logging/redaction policy need security-focused validation.
- **Phase 8:** Each wallet/APM requires separate Nuvei method-specific research, account setup, domain requirements, statuses, and DMN mapping.

Phases with standard patterns (skip research-phase unless project context changes):
- **Phase 1:** TypeScript/Fastify/TypeBox contract validation and method registry patterns are well understood.
- **Phase 4:** Native Payment metadata and input validation are repository-policy driven and can be planned from existing docs plus Phase 2 evidence.
- **Phase 6:** Vitest, local mock CT scenarios, fixture tests, and npm CI are established implementation patterns.
- **Phase 7:** Deployment docs, runbooks, health checks, scopes, origins, and npm command alignment are mostly repository/documentation work.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Strong repository evidence and official commercetools/Fastify/Vite/npm alignment. Medium only for exact Connect Node runtime and Nuvei SDK/SRI details until confirmed. |
| Features | HIGH | Feature expectations are grounded in repository docs, test scenarios, and payment connector norms. Nuvei sandbox behavior remains medium-confidence. |
| Architecture | HIGH | Component boundaries and data flow are repository-observed and match commercetools payment integration guidance. DMN field/correlation specifics remain medium-confidence. |
| Pitfalls | HIGH | Risks are grounded in current code/docs plus payment connector best practices. Exact Nuvei payload/casing/checksum behavior requires sandbox fixtures. |

**Overall confidence:** HIGH for roadmap direction; MEDIUM for Nuvei-specific implementation details that require sandbox evidence.

### Gaps to Address

- Nuvei DMN echo behavior for `merchant_unique_id`, `clientUniqueId`, `TransactionID`/`TransactionId`, operation events, duplicates, declines, 3DS, and mismatches: capture sanitized sandbox fixtures before locking production correlation.
- Confirmation pending semantics: validate whether Nuvei status can be delayed/inconclusive and define browser polling/timeout behavior from observed cases.
- Partial capture/refund support: decide whether to implement amount-bounded partials or explicitly reject unsupported partial operations.
- Billing/shopper data source: define which fields come from Checkout session, cart/customer, or explicit enabler options and validate them before `createPayment`.
- Checksum/body handling: verify form-vs-JSON payloads, plus-space normalization, casing variants, and SHA-256-only policy with signed fixtures.
- Connect runtime/package strategy: confirm supported Node LTS and either document package-local npm commands or deliberately cut over to npm workspaces.
- Operational evidence: create runbooks and log queries only from redacted fields that actually appear in deployed processor logs.

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` — stack direction, package-manager policy, CI/release gates, observability.
- `.planning/research/FEATURES.md` — table-stakes features, differentiators, anti-features, deferred scope, suggested phases.
- `.planning/research/ARCHITECTURE.md` — component boundaries, data flow, identifier strategy, architecture patterns.
- `.planning/research/PITFALLS.md` — critical/moderate/minor pitfalls, prevention strategies, phase warnings.
- Repository docs referenced by research: `.planning/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/PLAN.md`, `docs/NEXT_STEPS_PLAN.md`, `docs/TEST_SCENARIOS.md`, `docs/OPERATIONS.md`, `docs/NUVEI_SETUP.md`, `README.md`.
- Repository source referenced by research: processor routes/services/clients/converters/server setup, enabler API/card/SDK loader, `connect.yaml`, package manifests and lockfiles.

### Secondary (MEDIUM confidence)
- commercetools payment integration template and Checkout connector/session documentation — official architecture and best-practice guidance, mediated through research files.
- Nuvei payment DMN, response handling, and testing-card documentation — field/status/security expectations, requiring sandbox confirmation in this connector.
- npm, Fastify, and Vite documentation — package/workspace, HTTP framework, and library-build support.

### Tertiary (LOW confidence)
- None used as a basis for roadmap direction. Nuvei behavior not yet observed in sandbox should be treated as a validation gap, not a low-confidence source.

---
*Research completed: 2026-06-02*
*Ready for roadmap: yes*
