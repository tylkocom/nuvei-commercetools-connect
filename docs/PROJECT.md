# Nuvei commercetools Connector

## What This Is

A commercetools Connect payment connector that integrates Nuvei as a payment service provider for commercetools Checkout. The project contains a browser enabler that loads Nuvei Simply Connect/Web SDK components and a processor service that creates Nuvei sessions, updates commercetools Payments, handles Payment Intents operations, and reconciles final state through Nuvei DMN webhooks.

The current codebase is a working first-pass implementation, but the project is not production-ready until real sandbox E2E validation, DMN correlation, reconciliation correctness, security hardening, deployment repeatability, and CI quality gates are proven.

## Core Value

Card-first Nuvei payments must reconcile correctly and safely between browser Checkout, Nuvei, and commercetools Payments without duplicate, missing, or misattributed transactions.

## Requirements

### Validated

- ✓ Processor and enabler packages exist with unit test suites and TypeScript builds — existing
- ✓ Processor exposes payment, operation, and Nuvei webhook routes for the connector shape — existing
- ✓ Enabler exposes card and embedded drop-in builders that call the processor and load Nuvei SDK — existing
- ✓ Processor can call Nuvei openOrder/getPaymentStatus and map Nuvei DMN data to commercetools transaction concepts — existing
- ✓ Capture, cancel authorization, and refund operations are implemented through Payment Intents route handlers — existing

### Active

- [ ] Prove Nuvei sandbox DMN payload correlation for real authorization, decline, 3DS, capture, cancel, refund, duplicate, and mismatch events.
- [ ] Harden DMN processing so events map to exactly one commercetools Payment, reject unsafe mismatches, and remain idempotent.
- [ ] Add replay-safe DMN handling that treats checksum-valid unsigned fields as untrusted until revalidated against Nuvei/API/payment state.
- [ ] Make session-authenticated payment creation idempotent per cart/session so retries cannot create unbounded Nuvei orders or CT Payments.
- [ ] Make Checkout-facing enabler and processor contracts explicit, validated, and aligned for supported payment methods.
- [ ] Replace hardcoded browser billing data with correct Checkout/session/cart/shopper-derived data or explicit validated enabler options.
- [ ] Require allowlisted merchant return URLs and HTTPS processor URLs, with local HTTP allowed only in explicit development mode.
- [ ] Improve frontend resilience for Nuvei SDK loading and delayed/inconclusive confirmation states.
- [ ] Validate Complete Checkout and Payment Only flows end to end in a commercetools sandbox.
- [ ] Standardize package manager/build/deployment documentation against the actual repository layout.
- [ ] Resolve Nuvei DMN checksum algorithm policy to one public behavior and remove conflicting MD5/SHA-256 guidance.
- [ ] Add CI quality gates for processor and enabler installs, builds, and tests.
- [ ] Update public docs so readiness claims match observed sandbox and operational evidence.

### Out of Scope

- Nuvei wallet/APM expansion — defer until the card payment baseline is stable and reconciles correctly.
- Production rollout — blocked until sandbox E2E, DMN correlation, and operational runbooks are complete.
- Storing PAN or sensitive card data — the connector must rely on Nuvei and safe commercetools Payment metadata only.
- Custom commercetools Types for payment metadata — current policy is to use native Payment fields exclusively.

## Context

- The repository has two Connect applications: `enabler` as browser assets and `processor` as a backend service.
- Nuvei is the source of truth for payment execution state. commercetools is the source of truth for carts, orders, and Payment records. DMN webhooks are the eventual-consistency mechanism for final state reconciliation.
- Existing docs identify several production-critical gaps: real DMN correlation proof, webhook hardening, hardcoded billing data, SDK load retry behavior, overstated readiness docs, package manager documentation drift, missing CI, and overly binary browser confirmation handling.
- A local testing harness now exists under `testing/` with an Express mock server and Postman collection to observe mock commercetools state and endpoint behavior while isolating Nuvei/processor interactions.
- Current package layout uses separate `processor/package-lock.json` and `enabler/package-lock.json`; there is no root package manifest or pnpm lockfile in the current working tree.

## Constraints

- **Reliability**: Payment state transitions must be idempotent and correctly correlated — duplicate or wrong-payment financial transactions are unacceptable.
- **Security**: No secrets, checksums, session tokens, PANs, or raw sensitive payment data may be exposed to shoppers or stored/logged unsafely.
- **Platform**: The connector must follow commercetools Connect payment integration expectations for enabler assets, processor routes, session auth, JWT/OAuth operation routes, and Payment Intents behavior.
- **Nuvei**: Nuvei sandbox payloads and Web SDK behavior must be observed directly before production claims or reconciliation assumptions are accepted.
- **Documentation**: Deployment and testing instructions must match the actual npm/package-lock repository layout unless the package strategy is intentionally changed.
- **Scope**: Card-first Checkout correctness takes precedence over adding wallets, APMs, express payments, or stored payment methods.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat card-first reconciliation as the core project priority | Financial correctness matters more than breadth of payment methods | — Pending |
| Use native commercetools Payment fields instead of Custom Types | Keeps the connector simpler and aligned with current architecture docs | — Pending |
| Defer wallet/APM expansion until card baseline is proven | Method expansion would multiply unproven reconciliation and security paths | — Pending |
| Use local mock commercetools testing before full Checkout E2E | Isolates Nuvei/processor behavior and gives full request/response visibility | — Pending |
| Keep planning docs committed to git | User selected git tracking for planning artifacts | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-02 after initialization*
