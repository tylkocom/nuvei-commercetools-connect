# Synthesized Requirement Intel

source: .planning/intel/classifications/*.json plus source docs

## Extracted requirements

### REQ-contract-method-hardening
source: docs/NEXT_STEPS_PLAN.md; docs/PLAN.md; docs/TEST_SCENARIOS.md; .planning/REQUIREMENTS.md
scope: Checkout-facing and processor-facing setup contract
Description: Enabler and processor must validate setup and supported methods before creating external state.
Acceptance criteria:
- Invalid enabler configuration fails early with actionable safe errors.
- Processor rejects malformed or unsupported payment creation requests before Nuvei `openOrder` or commercetools Payment creation.
- `GET /payment-components` advertises only methods the enabler can build and the processor can process.
- Unsupported methods create no Nuvei or commercetools state.
Already represented in planning: CONT-01 through CONT-05 are complete.

### REQ-nuvei-sandbox-evidence
source: docs/PLAN.md; docs/NEXT_STEPS_PLAN.md; docs/TESTING.md; docs/TEST_SCENARIOS.md; docs/IMPLEMENTATION_PLAN.md; .planning/REQUIREMENTS.md
scope: Nuvei sandbox and commercetools Checkout validation
Description: Real sandbox evidence must prove authorization, decline, 3DS, capture, cancel, refund, duplicate, mismatch, and Checkout modes.
Acceptance criteria:
- Complete Checkout and Payment Only card authorization succeed in sandbox.
- Declined cards and failed/abandoned 3DS fail safely without false success.
- Sanitized Nuvei payloads are captured for success, failure, 3DS, capture, cancel, refund, duplicate DMN, and mismatch cases.
- The canonical field mapping Nuvei events to exactly one commercetools Payment is identified.
Already represented in planning: NUV-01 through NUV-08.

### REQ-dmn-correlation-and-idempotency
source: docs/PLAN.md; docs/NUVEI_SETUP.md; docs/TEST_SCENARIOS.md; docs/security-review.md; docs/PAYMENT_CONFIRMATION_POLLING.md; .planning/REQUIREMENTS.md
scope: DMN processing and payment reconciliation
Description: DMNs, browser confirmation, and Payment Intents operations must reconcile to the right Payment exactly once.
Acceptance criteria:
- DMN processing validates checksum, merchant identity, correlation, amount, and currency before mutating a Payment.
- Missing, unknown, ambiguous, stale, replayed, amount-mismatched, or currency-mismatched DMNs fail safely without altering unrelated Payments.
- Duplicate DMNs and duplicate browser status polls do not create duplicate commercetools transactions.
- Frontend confirmation and DMN reconciliation agree on transaction identity or fail safely.
- Capture, cancel authorization, and refund use the correct prior Nuvei transaction identifiers.
Already represented in planning: RECON-01 through RECON-10. Missing/refinement from ingest: persistent replay protection with TTL and distrust of unsigned DMN fields should be explicit in Phase 3 or Phase 5 planning.

### REQ-payment-creation-idempotency
source: docs/security-review.md; docs/IMPLEMENTATION_PLAN.md
scope: session-authenticated payment creation
Description: Payment creation must not create unbounded Nuvei orders or commercetools Payments for the same cart/session.
Acceptance criteria:
- Reuse existing pending cart payments or require an idempotency key.
- Add rate limiting or equivalent abuse control for session-authenticated payment creation.
- Ensure retry behavior cannot create duplicate, missing, or misattributed transactions.
Already represented in planning: partially covered by reconciliation/idempotency requirements. Missing/refinement: payment-creation idempotency is not named explicitly in existing requirements.

### REQ-checkout-data-and-return-url
source: docs/PLAN.md; docs/NEXT_STEPS_PLAN.md; docs/security-review.md; docs/PAYMENT_CONFIRMATION_POLLING.md; .planning/REQUIREMENTS.md
scope: shopper, billing, return URL, origin, locale, session token
Description: Payment creation and confirmation must use validated Checkout/session/cart/shopper-derived data instead of hardcoded or unsafe values.
Acceptance criteria:
- Replace hardcoded billing country and empty email with Checkout/session/cart/shopper data or explicit validated enabler options.
- Validate required shopper, billing, return URL, locale, origin, and session token fields before Nuvei payment creation or status reconciliation.
- Validate merchant return URLs against an explicit origin allowlist before returning or using them.
- Do not place Nuvei session tokens in query parameters.
Already represented in planning: DATA-01 through DATA-03 and SEC requirements. Missing/refinement: return URL allowlist should be explicit.

### REQ-frontend-resilience-and-pending
source: docs/PLAN.md; docs/NEXT_STEPS_PLAN.md; docs/PAYMENT_CONFIRMATION_POLLING.md; docs/TEST_SCENARIOS.md; .planning/REQUIREMENTS.md
scope: browser confirmation and SDK loading
Description: Enabler must recover from SDK load failures and represent pending/inconclusive payment states safely.
Acceptance criteria:
- SDK loader inserts one script per page lifecycle, supports concurrent callers, reuses existing script, and can retry after failed load.
- Confirmation outcome supports `approved`, `rejected`, and `pending`.
- Bounded browser polling calls only the processor, never Nuvei directly, uses non-overlapping requests, and times out to pending/processing rather than hard error.
- Pending is represented through `onPending` or an explicit `PaymentResult` outcome shape.
Already represented in planning: SEC-01 through SEC-04 and TEST-04.

### REQ-security-hardening
source: docs/security-review.md; docs/IMPLEMENTATION_PLAN.md; docs/TEST_SCENARIOS.md; docs/OPERATIONS.md; .planning/REQUIREMENTS.md
scope: processor/enabler security
Description: Payment routes, webhooks, logs, and browser configuration must reject unsafe input and avoid leaking sensitive data.
Acceptance criteria:
- Require HTTPS `processorUrl`, with any `http://localhost` exception limited to explicit development mode.
- Redact secrets, checksums, session tokens, PAN-adjacent data, raw card data, and sensitive raw payload fields from logs and responses.
- Reject malformed or oversized frontend and webhook input predictably.
- Use timing-safe checksum comparison and safe shopper-facing errors with redacted diagnostics in logs.
- Validate CORS and session/JWT/OAuth behavior in local and deployed environments.
Already represented in planning: SEC-05 through SEC-08. Missing/refinement: HTTPS `processorUrl` is not explicit in existing requirements.

### REQ-money-moving-amount-validation
source: docs/security-review.md; docs/TEST_SCENARIOS.md; .planning/REQUIREMENTS.md
scope: capture, refund, reverse, partial operations
Description: Money-moving operation payloads must use valid positive integer amounts and remain bounded by authorized/captured/refunded totals.
Acceptance criteria:
- Enforce positive integer cent amounts and valid currency format.
- Compare capture amounts against remaining authorized totals.
- Compare refund amounts against captured minus refunded totals.
- Partial capture/refund either work within validated bounds or are explicitly rejected with safe errors.
Already represented in planning: RECON-10. Missing/refinement: positive integer schema and currency format validation are not explicit.

### REQ-testing-and-fixtures
source: docs/TESTING.md; docs/TEST_SCENARIOS.md; docs/PLAN.md; docs/IMPLEMENTATION_PLAN.md; .planning/REQUIREMENTS.md
scope: automated and manual validation
Description: Repeatable local, route-level, enabler, browser, and sandbox tests must prove critical payment paths.
Acceptance criteria:
- Local mock commercetools scenarios cover payment creation, confirmation, DMN, capture, cancel, refund, and ledger inspection.
- Sanitized Nuvei fixtures cover success, failure, duplicate, malformed, mismatch, missing correlation, 3DS, capture, cancel, and refund cases.
- Route-level tests cover `/payments`, `/payments/confirmPayments/:id`, `/payment-components`, `/payment-intents/:id`, and `/webhooks/nuvei`.
- Enabler tests cover card mount, SDK load success/failure/retry, processor errors, declined results, pending, and confirmation failures.
Already represented in planning: TEST-01 through TEST-04.

### REQ-ci-and-package-command-drift
source: docs/PLAN.md; docs/TEST_SCENARIOS.md; docs/DEPLOYMENT.md; docs/TESTING.md; docs/IMPLEMENTATION_PLAN.md; docs/OPERATIONS.md; docs/ARCHITECTURE.md; .planning/REQUIREMENTS.md
scope: package strategy, CI, documentation drift
Description: CI and docs must use the chosen package-manager strategy and prevent command drift.
Acceptance criteria:
- CI installs dependencies, builds, and runs tests for both processor and enabler using the chosen package strategy.
- README, deployment, testing, operations, and Connect scripts use commands matching the actual repository layout.
- Documentation command drift is caught by CI or release checks.
Conflict: docs disagree between package-local npm commands and root/pnpm commands. See conflict report.
Already represented in planning: TEST-05, TEST-06, OPS-01.

### REQ-deployment-and-operations
source: docs/DEPLOYMENT.md; docs/NUVEI_SETUP.md; docs/OPERATIONS.md; docs/TEST_SCENARIOS.md; docs/IMPLEMENTATION_PLAN.md
scope: deployment, health, status, DMN setup, runbooks
Description: Operators must be able to deploy, configure Nuvei, verify health/status, and recover from common failures using accurate instructions.
Acceptance criteria:
- Connect deployment configuration, post-deploy, and pre-undeploy scripts are verified in a real environment.
- Nuvei dashboard setup includes DMN URL, environment, checksum policy, and sandbox credential verification.
- `/health` and `/status` give actionable processor, commercetools, and Nuvei reachability visibility.
- Runbooks exist for failed authorization, missing DMN, invalid checksum, failed capture, failed refund, auth-scope failure, CORS/session failure, Nuvei outage, and deployment failure.
Already represented in planning: OPS-02 through OPS-05.

### REQ-readiness-claims
source: docs/PLAN.md; docs/TEST_SCENARIOS.md; docs/IMPLEMENTATION_PLAN.md; .planning/PROJECT.md; .planning/REQUIREMENTS.md
scope: public docs and release readiness
Description: Public and operator-facing readiness claims must match observed sandbox evidence and known limitations.
Acceptance criteria:
- Do not claim production-ready/MVP-complete until sandbox E2E, DMN correlation, reconciliation, fixture, CI, and operational runbook evidence exist.
- Remaining limitations are documented clearly.
- Completion criteria include sandbox authorization, Payment Only, failed 3DS/decline, DMN idempotency, operation IDs, mismatch rejection, CI, and documentation accuracy.
Already represented in planning: OPS-06 and project active requirements.

### REQ-custom-storefront-direct-usage
source: docs/IMPLEMENTATION_PLAN.md; docs/TEST_SCENARIOS.md
scope: custom storefront usage outside hosted Checkout
Description: Some source docs require the same enabler/processor to support a custom checkout storefront using a valid session/BFF flow.
Acceptance criteria:
- A custom page can load the enabler asset, mount the card component, and complete an approving sandbox payment.
- Processor session auth still protects cart/payment access.
- commercetools Payment and Nuvei transaction states match.
Planning status: not clearly represented in current `.planning/REQUIREMENTS.md` roadmap; warning in conflict report because this may be scope expansion relative to the current Checkout-focused plan.
