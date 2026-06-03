# Roadmap: Nuvei commercetools Connector

## Overview

This roadmap delivers a reconciliation-first Nuvei commercetools connector by hardening the Checkout/processor contract before any external state is created, proving card behavior with real Nuvei and commercetools sandbox evidence, then locking processor reconciliation, data quality, frontend/security behavior, regression gates, and operational readiness. Payment-method expansion remains last and optional because card correctness is the load-bearing baseline.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Contract and Method Hardening** - Invalid inputs and unsupported methods fail before Nuvei or commercetools state is created.
- [ ] **Phase 2: Nuvei Sandbox Evidence and Checkout Validation** - Real sandbox card, 3DS, operation, duplicate, and mismatch behavior is captured and Checkout card authorization is proven.
- [ ] **Phase 3: Processor Reconciliation Correctness** - DMNs, frontend confirmation, and Payment Intents operations reconcile to the right commercetools Payment exactly once.
- [ ] **Phase 4: Checkout Data and Metadata Correctness** - Card payment creation uses validated shopper, billing, return, locale, origin, and safe native Payment metadata.
- [ ] **Phase 5: Frontend Resilience and Security Hardening** - Shopper-facing payment flows handle pending states and SDK failures safely while logs and inputs stay secure.
- [ ] **Phase 6: Regression Fixtures, Local Mock, and CI Gates** - Reconciliation behavior is locked down with repeatable local scenarios, sanitized fixtures, route/enabler tests, and package-specific CI.
- [ ] **Phase 7: Deployment and Operational Readiness** - Deployment, Nuvei dashboard setup, health visibility, runbooks, and public docs match observed evidence and repo reality.
- [ ] **Phase 8: Optional Payment Method Expansion** - Future wallets/APMs/stored methods can be added one at a time only after card parity evidence exists for each method.

## Phase Details

### Phase 1: Contract and Method Hardening

**Goal**: Checkout, enabler, and processor boundaries reject invalid payment setup before external payment state is created.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05
**Success Criteria** (what must be TRUE):

  1. User cannot start a Nuvei card payment unless required enabler constructor options are present and valid.
  2. User cannot create a Nuvei order or commercetools Payment from an invalid processor payment request.
  3. User only sees payment methods that both the enabler can build and the processor can process.
  4. User receives an actionable safe error when an unsupported method is requested, with no Nuvei or commercetools state created.

**Plans**: 3 plansPlans:
**Wave 1**

- [x] 01-01-PLAN.md — Harden enabler safe setup errors, mirrored method registry, and builder-side method validation.
- [x] 01-02-PLAN.md — Harden processor registry, payment request validation, route/service safe errors, and pre-side-effect rejection.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Add cross-package parity tests proving processor advertisements, processor accepted methods, and enabler builders stay aligned.

**UI hint**: yes

### Phase 01.2: Enabler dual-mode Nuvei frontend integration (INSERTED)

**Goal:** Add explicit NuveiSimplyConnectEnabler and NuveiWebSdkEnabler classes, remove embedded/drop-in support everywhere, split SDK loaders, migrate testing harness to examples/nuvei-web-ui, and remove Postman assets.
**Requirements**: CONT-03, CONT-04, CONT-05, TEST-01, TEST-04
**Depends on:** Phase 1
**Plans:** 5 plans

**Wave 1** *(parallel — no shared files)*

- [ ] 01.2-01-PLAN.md — Remove embedded from processor registry and DropinType enum; update parity test skeleton to card-only.
- [ ] 01.2-02-PLAN.md — Delete dropin-embedded.ts; rename nuvei-sdk.ts → simply-connect-sdk.ts; remove embedded from enabler registry and public API.
- [ ] 01.2-03-PLAN.md — Scaffold examples/nuvei-web-ui npm package; migrate mock CT server, tunnel, e2e scripts; delete Postman assets.

**Wave 2** *(blocked on Wave 1 — 01.2-02 specifically)*

- [ ] 01.2-04-PLAN.md — Implement Web SDK card path (web-sdk.ts loader, WebSdkCardComponent); add NuveiSimplyConnectEnabler, NuveiWebSdkEnabler, NuveiEnabler facade; unit tests for both modes.

**Wave 3** *(blocked on Waves 1 and 2)*

- [ ] 01.2-05-PLAN.md — Finalize cross-package parity tests; add examples/nuvei-web-ui/index.html mode selector; update docs.

### Phase 01.1: Processor API design cleanup and health endpoint (INSERTED)

**Goal:** Remove Stripe-template naming from the processor HTTP API surface, drop dead routes, and add GET /health for unauthenticated infra probes. All existing commercetools Checkout compatibility is preserved.
**Requirements**: OPS-04
**Depends on:** Phase 1
**Plans:** 2/2 plans complete

**Wave 1**

- [x] 01.1-01-PLAN.md — Processor route renames, GET /health endpoint, DTO fixes, and test updates.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01.1-02-PLAN.md — Enabler URL updates, Postman collection, and ARCHITECTURE.md documentation.

### Phase 01.1.1: Payment confirmation tri-state outcome correctness (INSERTED)

**Goal:** Fix payment confirmation correctness so `/payments/confirm/:id` returns approved/rejected/pending accurately, never false-approves Nuvei non-approved state, exposes pending to the enabler without polling, and uses canonical Nuvei `PPP_TransactionID` identity for terminal CT Authorization records and DMN idempotency.
**Requirements**: RECON-01, RECON-05, RECON-06, SEC-01, SEC-02, TEST-03, TEST-04
**Depends on:** Phase 1.1
**Plans:** 3/3 plans complete

Plans:

- [ ] Plan 01: Processor tri-state confirmation and canonical PPP terminal identity
- [ ] Plan 02: Enabler tri-state parsing, callbacks, and known session-token handoff
- [ ] Plan 03: Docs, local guides, and Postman alignment with tri-state contract

### Phase 2: Nuvei Sandbox Evidence and Checkout Validation

**Goal**: Real Nuvei sandbox and commercetools Checkout card behavior is observed, sanitized, and sufficient to choose canonical correlation fields.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: NUV-01, NUV-02, NUV-03, NUV-04, NUV-05, NUV-06, NUV-07, NUV-08
**Success Criteria** (what must be TRUE):

  1. User can complete a successful sandbox card authorization in Complete Checkout and Payment Only modes.
  2. User can exercise decline, 3DS frictionless, 3DS step-up success, and 3DS failure or abandonment flows with sanitized evidence captured.
  3. Operator can inspect sanitized sandbox payload evidence for capture, cancel authorization, refund, duplicate DMN, and mismatch cases.
  4. Operator can identify the canonical Nuvei DMN field that maps each event to exactly one commercetools Payment.

**Plans**: TBD
**UI hint**: yes

### Phase 3: Processor Reconciliation Correctness

**Goal**: The processor mutates commercetools Payments only when Nuvei events and operations are correctly correlated, validated, idempotent, and safe.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: RECON-01, RECON-02, RECON-03, RECON-04, RECON-05, RECON-06, RECON-07, RECON-08, RECON-09, RECON-10, RECON-11, RECON-12, RECON-13, RECON-14
**Success Criteria** (what must be TRUE):

  1. Operator can trace Nuvei session tokens, Nuvei transaction IDs, cart IDs, and commercetools Payment IDs without ambiguous identity.
  2. Duplicate, out-of-order, replayed, stale, mismatched, malformed, checksum-valid-but-unsafe, or ambiguous DMNs do not create duplicate transactions or update unrelated Payments.
  3. User-visible frontend confirmation and later DMN reconciliation agree on the same transaction identity or fail safely.
  4. Operator can capture, cancel authorization, and refund using the correct prior Nuvei transaction identifiers and see the correct commercetools transaction types recorded.
  5. Capture and refund amounts are positive, currency-valid, and bounded by remaining authorized/captured/refundable totals, or are rejected with safe actionable errors.
  6. Session-authenticated payment creation is idempotent per cart/session and cannot create unbounded Nuvei orders or CT Payments through retries.

**Plans**: TBD

### Phase 4: Checkout Data and Metadata Correctness

**Goal**: Card payment creation uses validated Checkout, cart, shopper, and enabler data and stores only safe native commercetools Payment metadata.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06
**Success Criteria** (what must be TRUE):

  1. User no longer sends hardcoded billing country or empty email when Checkout, cart, shopper, or validated enabler data is available.
  2. User cannot create a Nuvei payment without required shopper, billing, return URL, locale, and origin inputs.
  3. User can complete 3DS sandbox flows with sufficient billing and shopper data for approval or challenge handling.
  4. Operator can inspect Merchant Center payment method labels and transaction identifiers that support reconciliation without exposing PAN or sensitive card data.
  5. Merchant return URLs are allowlisted before browser exposure or redirect use.

**Plans**: TBD
**UI hint**: yes

### Phase 5: Frontend Resilience and Security Hardening

**Goal**: Browser and processor payment paths handle delayed states, SDK failures, unsafe input, and sensitive data without leaking secrets or misleading shoppers.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, SEC-09
**Success Criteria** (what must be TRUE):

  1. User receives distinct approved, rejected, and pending or inconclusive browser confirmation outcomes.
  2. User sees bounded polling or clear fallback behavior when payment confirmation is pending instead of an immediate hard failure.
  3. User can recover from a failed Nuvei SDK script load without duplicate script injection.
  4. Operator can diagnose failures from redacted logs while secrets, checksums, session tokens, PAN-adjacent values, and sensitive raw payload fields remain protected.
  5. Malformed, oversized, unauthenticated, non-HTTPS processor URL, or disallowed-origin frontend and webhook requests are rejected predictably.

**Plans**: TBD
**UI hint**: yes

### Phase 6: Regression Fixtures, Local Mock, and CI Gates

**Goal**: Card reconciliation behavior and package quality checks are repeatable through fixtures, local mock scenarios, route/enabler tests, and CI gates.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):

  1. Developer can run local mock commercetools scenarios for payment creation, confirmation, DMN, capture, cancel, refund, and ledger inspection.
  2. Developer can replay sanitized Nuvei fixtures for success, failure, duplicate, malformed, mismatch, missing-correlation, 3DS, capture, cancel, and refund cases.
  3. Developer can rely on processor route-level and enabler tests to catch regressions in supported payment behavior and error handling.
  4. CI installs, builds, and tests both processor and enabler with the chosen npm/package-lock strategy and catches documentation command drift.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Deployment and Operational Readiness

**Goal**: Operators can deploy, verify, observe, and recover the card connector using instructions and runbooks that match the repository and sandbox evidence.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06, OPS-07
**Success Criteria** (what must be TRUE):

  1. Operator can follow README, deployment, testing, and operations docs whose commands match the actual npm/package-lock repository layout.
  2. Operator can verify Connect deployment configuration, post-deploy, and pre-undeploy behavior in a real environment.
  3. Operator can configure Nuvei DMN URL, environment, checksum policy, and sandbox credentials using documented verification steps.
  4. Operator can use health/status checks and runbooks to diagnose failed authorization, missing DMN, invalid checksum, failed capture, failed refund, auth-scope failure, CORS/session failure, Nuvei outage, and checksum algorithm mismatch.
  5. User and operator-facing readiness claims match observed sandbox evidence and known limitations.
  6. Public docs contain one checksum algorithm policy and one package-manager command strategy.

**Plans**: TBD

### Phase 8: Optional Payment Method Expansion

**Goal**: Future payment methods are introduced only when each method has its own setup, browser flow, reconciliation mapping, fixtures, observability, and runbooks.
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: PMTH-01, PMTH-02, PMTH-03, PMTH-04, PMTH-05, CUST-01
**Success Criteria** (what must be TRUE):

  1. Operator can decide whether Apple Pay, Google Pay, an APM, stored payments, or chargeback handling is ready based on method-specific Nuvei setup and evidence.
  2. User only sees a newly enabled payment method after its browser flow, Nuvei parameters, DMN mapping, operations support, fixtures, and runbook are complete.
  3. Developer can add one payment method through the shared registry without weakening card reconciliation guarantees.
  4. Operator can observe and recover method-specific failures with the same safety bar as card payments.
  5. Developer can enable custom storefront direct usage only after hosted Checkout and Payment Only card reconciliation are proven and protected by the same auth, session, fixture, and runbook guarantees.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Contract and Method Hardening | 3/3 | Complete | 2026-06-02 |
| 2. Nuvei Sandbox Evidence and Checkout Validation | 0/TBD | Not started | - |
| 3. Processor Reconciliation Correctness | 0/TBD | Not started | - |
| 4. Checkout Data and Metadata Correctness | 0/TBD | Not started | - |
| 5. Frontend Resilience and Security Hardening | 0/TBD | Not started | - |
| 6. Regression Fixtures, Local Mock, and CI Gates | 0/TBD | Not started | - |
| 7. Deployment and Operational Readiness | 0/TBD | Not started | - |
| 8. Optional Payment Method Expansion | 0/TBD | Not started | - |
