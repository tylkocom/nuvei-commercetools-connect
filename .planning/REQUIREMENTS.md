# Requirements: Nuvei commercetools Connector

**Defined:** 2026-06-02
**Core Value:** Card-first Nuvei payments must reconcile correctly and safely between browser Checkout, Nuvei, and commercetools Payments without duplicate, missing, or misattributed transactions.

## v1 Requirements

Requirements for the production-ready card-first connector. Each maps to roadmap phases.

### Contract

- [x] **CONT-01**: Enabler validates required constructor options before loading Nuvei SDK or calling the processor.
- [x] **CONT-02**: Processor validates payment creation requests before creating Nuvei orders or commercetools Payments.
- [x] **CONT-03**: Processor and enabler use one shared supported-method contract for `card` and any retained `embedded` drop-in mode.
- [x] **CONT-04**: `GET /payment-components` advertises only methods the enabler can actually build and the processor can actually process.
- [x] **CONT-05**: Unsupported payment methods fail with actionable errors and do not create Nuvei or commercetools state.

### Nuvei Sandbox Evidence

- [ ] **NUV-01**: Sandbox testing captures sanitized Nuvei payloads for successful card authorization.
- [ ] **NUV-02**: Sandbox testing captures sanitized Nuvei payloads for declined card authorization.
- [ ] **NUV-03**: Sandbox testing captures sanitized Nuvei payloads for 3DS frictionless approval.
- [ ] **NUV-04**: Sandbox testing captures sanitized Nuvei payloads for 3DS step-up approval and failure or abandonment.
- [ ] **NUV-05**: Sandbox testing captures sanitized Nuvei payloads for capture, cancel authorization, refund, duplicate DMN, and mismatch cases.
- [ ] **NUV-06**: Sandbox evidence identifies the canonical DMN field that maps a Nuvei event to exactly one commercetools Payment.
- [ ] **NUV-07**: Complete Checkout card authorization succeeds in a commercetools sandbox.
- [ ] **NUV-08**: Payment Only card authorization succeeds in a commercetools sandbox.

### Reconciliation

- [ ] **RECON-01**: Processor stores or derives the identifiers required to relate Nuvei session tokens, Nuvei transaction IDs, cart IDs, and commercetools Payment IDs safely.
- [ ] **RECON-02**: DMN processing validates checksum, merchant ID, merchant site ID, payment correlation, amount, and currency before mutating a Payment.
- [ ] **RECON-03**: Duplicate DMNs do not create duplicate commercetools transactions.
- [ ] **RECON-04**: Out-of-order or ambiguous DMNs fail safely without updating unrelated Payments.
- [ ] **RECON-05**: Frontend confirmation and DMN reconciliation agree on transaction identity and do not create conflicts.
- [ ] **RECON-06**: Processor maps Nuvei statuses to commercetools transaction states with explicit handling for success, failure, pending, cancelled, expired, or action-required cases.
- [ ] **RECON-07**: Capture uses the correct Nuvei authorization transaction identifier and records a `Charge` transaction.
- [ ] **RECON-08**: Cancel authorization uses the correct Nuvei authorization transaction identifier and records a `CancelAuthorization` transaction.
- [ ] **RECON-09**: Refund uses the correct Nuvei charge transaction identifier and records a `Refund` transaction.
- [ ] **RECON-10**: Partial capture and partial refund are either implemented with amount bounds or explicitly rejected with safe errors.
- [ ] **RECON-11**: DMN handling treats checksum-valid but unsigned fields as untrusted and revalidates `merchant_unique_id`, `TransactionID`, `transactionType`, `ppp_status`, and `clientUniqueId` against Nuvei/API/payment state before any mutation.
- [ ] **RECON-12**: DMN replay protection rejects stale notifications and deduplicates using persistent Nuvei event or checksum-relevant immutable identifiers, not only commercetools transaction `interactionId`.
- [ ] **RECON-13**: Session-authenticated payment creation is idempotent per cart/session through reuse of a pending Payment or a validated idempotency key.
- [ ] **RECON-14**: Capture and refund payloads enforce positive integer cent amounts, valid currency format, and remaining capturable/refundable balance before Nuvei calls.

### Checkout Data and Metadata

- [ ] **DATA-01**: Enabler no longer sends hardcoded billing country or empty email when Checkout/cart/shopper/enabler data is available.
- [ ] **DATA-02**: Required shopper, billing, return URL, locale, and origin inputs are validated before Nuvei payment creation.
- [ ] **DATA-03**: 3DS flows use billing/shopper data sufficient for Nuvei sandbox approval and challenge handling.
- [ ] **DATA-04**: Payment metadata stored in commercetools uses only native Payment fields and contains no PAN or sensitive card data.
- [ ] **DATA-05**: Merchant Center-visible payment method labels and transaction identifiers are useful for support and reconciliation.
- [ ] **DATA-06**: Merchant return URLs are validated against an explicit origin allowlist before being returned to the browser or used for redirects.

### Frontend and Security

- [ ] **SEC-01**: Browser confirmation supports approved, rejected, and pending/inconclusive outcomes.
- [ ] **SEC-02**: Pending browser confirmation uses bounded polling or clear fallback behavior instead of treating all inconclusive statuses as hard errors.
- [ ] **SEC-03**: Nuvei SDK loader recovers after failed script loads and does not inject duplicate scripts.
- [ ] **SEC-04**: Nuvei SDK SRI update and rotation process is documented and testable.
- [ ] **SEC-05**: Processor logs redact secrets, checksums, session tokens, PAN-adjacent data, and sensitive raw payload fields.
- [ ] **SEC-06**: Shopper-facing errors are safe while operational logs retain enough redacted context for diagnosis.
- [ ] **SEC-07**: Frontend and webhook routes reject malformed or oversized input predictably.
- [ ] **SEC-08**: CORS and session/JWT/OAuth authentication behavior is validated in local and deployed environments.
- [ ] **SEC-09**: Enabler `processorUrl` requires HTTPS, with any `http://localhost` exception restricted to explicit development mode.

### Testing and CI

- [ ] **TEST-01**: Local mock commercetools scenarios cover payment creation, confirmation, DMN, capture, cancel, refund, and ledger inspection.
- [ ] **TEST-02**: Sanitized Nuvei fixtures cover success, failure, duplicate, malformed, amount mismatch, currency mismatch, missing correlation, 3DS, capture, cancel, and refund cases.
- [ ] **TEST-03**: Processor route-level tests cover `/payments`, `/payments/confirmPayments/:id`, `/payment-components`, `/payment-intents/:id`, and `/webhooks/nuvei`.
- [ ] **TEST-04**: Enabler tests cover card mount, SDK load success/failure/retry, processor errors, declined payment results, and confirmation pending/failure states.
- [ ] **TEST-05**: CI installs dependencies, builds, and runs tests for both `processor` and `enabler` using the chosen package strategy.
- [ ] **TEST-06**: CI or documented release checks prevent README/deployment command drift from recurring.

### Deployment and Operations

- [ ] **OPS-01**: README, deployment, testing, and operations docs describe commands that match the actual repository package manager strategy.
- [ ] **OPS-02**: Connect deployment configuration, post-deploy, and pre-undeploy scripts are verified in a real environment.
- [ ] **OPS-03**: Nuvei dashboard setup for DMN URL, environment, checksum policy, and sandbox credentials is documented with verification steps.
- [ ] **OPS-04**: `/health` and `/status` checks give operators actionable visibility into processor, commercetools, and Nuvei reachability.
- [ ] **OPS-05**: Runbooks exist for failed authorization, missing DMN, invalid checksum, failed capture, failed refund, auth-scope failure, CORS/session failure, and Nuvei outage.
- [ ] **OPS-06**: Public readiness claims are updated to match observed sandbox evidence and known limitations.
- [ ] **OPS-07**: Nuvei DMN checksum algorithm policy is resolved to one documented behavior and conflicting MD5/SHA-256 guidance is removed from public docs.

## v2 Requirements

Deferred to future releases after card reconciliation is proven.

### Payment Method Expansion

- **PMTH-01**: Connector can add Apple Pay after Nuvei account/domain setup, browser flow, DMN mapping, and fixtures are defined.
- **PMTH-02**: Connector can add Google Pay after Nuvei account/domain setup, browser flow, DMN mapping, and fixtures are defined.
- **PMTH-03**: Connector can add Nuvei APMs one method at a time through the same registry, validation, reconciliation, tests, and runbooks as card.
- **PMTH-04**: Connector can support stored payment methods or tokenized repeat payments after data retention and security requirements are agreed.
- **PMTH-05**: Connector can support advanced chargeback handling beyond basic mapping after operational requirements are defined.

### Custom Storefront Usage

- **CUST-01**: Connector can support custom storefront direct usage with the same enabler/processor only after hosted Checkout and Payment Only card reconciliation are proven.

## Out of Scope

Explicitly excluded from the current roadmap.

| Feature | Reason |
|---------|--------|
| Production rollout before sandbox E2E evidence | Core reconciliation behavior is not yet proven with real Nuvei payloads. |
| Wallets/APMs in v1 | Payment-method breadth would multiply unproven DMN, 3DS, security, and operations paths. |
| Storing PAN or sensitive card data | Nuvei-hosted fields should keep sensitive payment capture outside the connector. |
| Custom commercetools Types for metadata | Current architecture intentionally uses native Payment fields only. |
| Treating browser callback as final payment truth | Processor verification and DMN reconciliation must govern final ledger state. |
| Silent acceptance of malformed/ambiguous DMNs | Wrong-payment mutation risk is unacceptable. |

## Traceability

Which phases cover which v1 requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONT-01 | Phase 1 | Complete |
| CONT-02 | Phase 1 | Complete |
| CONT-03 | Phase 1 | Complete |
| CONT-04 | Phase 1 | Complete |
| CONT-05 | Phase 1 | Complete |
| NUV-01 | Phase 2 | Pending |
| NUV-02 | Phase 2 | Pending |
| NUV-03 | Phase 2 | Pending |
| NUV-04 | Phase 2 | Pending |
| NUV-05 | Phase 2 | Pending |
| NUV-06 | Phase 2 | Pending |
| NUV-07 | Phase 2 | Pending |
| NUV-08 | Phase 2 | Pending |
| RECON-01 | Phase 3 | Pending |
| RECON-02 | Phase 3 | Pending |
| RECON-03 | Phase 3 | Pending |
| RECON-04 | Phase 3 | Pending |
| RECON-05 | Phase 3 | Pending |
| RECON-06 | Phase 3 | Pending |
| RECON-07 | Phase 3 | Pending |
| RECON-08 | Phase 3 | Pending |
| RECON-09 | Phase 3 | Pending |
| RECON-10 | Phase 3 | Pending |
| RECON-11 | Phase 3 | Pending |
| RECON-12 | Phase 3 | Pending |
| RECON-13 | Phase 3 | Pending |
| RECON-14 | Phase 3 | Pending |
| DATA-01 | Phase 4 | Pending |
| DATA-02 | Phase 4 | Pending |
| DATA-03 | Phase 4 | Pending |
| DATA-04 | Phase 4 | Pending |
| DATA-05 | Phase 4 | Pending |
| DATA-06 | Phase 4 | Pending |
| SEC-01 | Phase 5 | Pending |
| SEC-02 | Phase 5 | Pending |
| SEC-03 | Phase 5 | Pending |
| SEC-04 | Phase 5 | Pending |
| SEC-05 | Phase 5 | Pending |
| SEC-06 | Phase 5 | Pending |
| SEC-07 | Phase 5 | Pending |
| SEC-08 | Phase 5 | Pending |
| SEC-09 | Phase 5 | Pending |
| TEST-01 | Phase 6 | Pending |
| TEST-02 | Phase 6 | Pending |
| TEST-03 | Phase 6 | Pending |
| TEST-04 | Phase 6 | Pending |
| TEST-05 | Phase 6 | Pending |
| TEST-06 | Phase 6 | Pending |
| OPS-01 | Phase 7 | Pending |
| OPS-02 | Phase 7 | Pending |
| OPS-03 | Phase 7 | Pending |
| OPS-04 | Phase 7 | Pending |
| OPS-05 | Phase 7 | Pending |
| OPS-06 | Phase 7 | Pending |
| OPS-07 | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 55 total
- Mapped to phases: 55
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-02*
*Last updated: 2026-06-02 after docs ingest merge*
