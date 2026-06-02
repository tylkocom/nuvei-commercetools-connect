# Synthesized Context Intel

source: DOC-classified inputs, existing planning files, and phase context

## Topic: Current project posture
source: docs/PLAN.md; docs/ARCHITECTURE.md; .planning/PROJECT.md; .planning/STATE.md
The connector is a working first-pass implementation with processor and enabler packages, unit tests, TypeScript builds, Checkout-facing enabler builders, processor payment routes, Payment Intents operations, and Nuvei DMN handling. It is not production-ready until sandbox E2E, DMN correlation, reconciliation correctness, security hardening, deployment repeatability, CI gates, and public documentation are proven.

Already represented in planning: yes — `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md` all frame the project as card-first but not production-ready.

## Topic: Package-manager and command drift
source: docs/PLAN.md; docs/TEST_SCENARIOS.md; docs/DEPLOYMENT.md; docs/TESTING.md; docs/OPERATIONS.md; docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; .planning/PROJECT.md; .planning/STATE.md
Source docs disagree. Current planning and `docs/PLAN.md` say the actual repository uses separate `processor/package-lock.json` and `enabler/package-lock.json`, no root package manifest, and no root `pnpm-lock.yaml`; `docs/TEST_SCENARIOS.md` uses package-local npm commands. Other docs still prescribe root `pnpm install`, `pnpm build`, `pnpm test`, `pnpm --filter`, and root workspace files.

Conflict status: warning in `.planning/INGEST-CONFLICTS.md`.

## Topic: Checksum algorithm policy
source: docs/DEPLOYMENT.md; docs/NUVEI_SETUP.md; docs/OPERATIONS.md; docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; .planning/PROJECT.md
Docs agree on SHA-256 as the default checksum policy but differ on MD5. Deployment says `NUVEI_DMN_CHECKSUM_ALGORITHM` is `sha256` only. Implementation plan says not to support MD5 unless Nuvei demonstrably requires it, explicitly feature-flagged and documented as legacy. Nuvei setup, operations, and architecture describe configurable or legacy MD5 behavior.

Conflict status: warning in `.planning/INGEST-CONFLICTS.md`.

## Topic: Endpoint naming drift
source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; docs/TEST_SCENARIOS.md; docs/PAYMENT_CONFIRMATION_POLLING.md; .planning/REQUIREMENTS.md
Older docs mention `/nuvei/payments`, `/nuvei/payments/confirm`, `/nuvei/webhooks`, `/transactions`, and `/payments/confirm`. Current planning and functional scenarios use `/payments`, `/payments/confirmPayments/:paymentId`, `/payment-intents/:paymentId`, and `/webhooks/nuvei`. Polling proposal adds `POST /payments/:paymentId/status` as a suggested future endpoint.

Conflict status: warning in `.planning/INGEST-CONFLICTS.md`.

## Topic: Drop-in and embedded terminology
source: docs/NEXT_STEPS_PLAN.md; docs/TEST_SCENARIOS.md; docs/PLAN.md; .planning/STATE.md; .planning/phases/01-contract-and-method-hardening/01-CONTEXT.md
Current planning says the registry key is `embedded`, not `dropin`, and processor accepts exactly `card` plus transitional `embedded`. Some docs use drop-in generically or mention `paymentMethodOptions.dropin` in scenario text. Downstream work should preserve `embedded` as the actual key unless a later decision changes it.

Conflict status: warning in `.planning/INGEST-CONFLICTS.md`.

## Topic: DMN correlation and replay risk
source: docs/PLAN.md; docs/NUVEI_SETUP.md; docs/security-review.md; docs/TEST_SCENARIOS.md; docs/ARCHITECTURE.md; .planning/REQUIREMENTS.md
The known critical gap is proving which Nuvei DMN fields reliably correlate back to one commercetools Payment. Security review adds that fields outside the checksum must be treated as untrusted and replay protection is incomplete unless stale timestamps and immutable event identifiers are handled with persistent TTL-backed dedupe.

Already represented in planning: partly — correlation, idempotency, mismatch rejection, and sandbox evidence are represented. Missing/refinement: explicit unsigned-field distrust and persistent replay TTL should be carried into Phase 3/5 planning.

## Topic: Payment creation idempotency
source: docs/security-review.md; docs/IMPLEMENTATION_PLAN.md; .planning/REQUIREMENTS.md
Security review finds every `POST /payments` can create a new Nuvei `openOrder` and CT Payment for the same authenticated cart. Suggested remediation is reusing existing pending cart payments or requiring idempotency keys, plus rate limiting for session-authenticated payment creation.

Already represented in planning: partially under reconciliation/idempotency. Missing/refinement: payment creation idempotency should be explicit.

## Topic: HTTPS processorUrl
source: docs/security-review.md; .planning/REQUIREMENTS.md
Security review requires enabler `processorUrl` to be HTTPS, with `http://localhost` allowed only in explicit development mode. This prevents leaking session credentials over HTTP or to untrusted endpoints.

Already represented in planning: partially under SEC-08/CORS/session validation. Missing/refinement: HTTPS `processorUrl` should be explicit.

## Topic: Return URL allowlist
source: docs/security-review.md; docs/PAYMENT_CONFIRMATION_POLLING.md; .planning/REQUIREMENTS.md
Security review flags `merchantReturnUrl` as a future open-redirect/phishing risk unless validated against an explicit origin allowlist. Polling plan also warns not to put `sessionToken` in query parameters.

Already represented in planning: partially under DATA-02/SEC requirements. Missing/refinement: return URL allowlist should be explicit.

## Topic: Money-moving amount validation
source: docs/security-review.md; docs/TEST_SCENARIOS.md; .planning/REQUIREMENTS.md
Capture/refund/reverse flows must use positive integer cent amounts, valid currencies, correct prior transaction IDs, and bounds against authorized/captured/refunded totals. Partial capture/refund must either be supported within bounds or explicitly rejected with safe errors.

Already represented in planning: RECON-07 through RECON-10 cover operation correctness. Missing/refinement: integer schema and amount-bound checks should be explicit.

## Topic: Custom storefront direct usage
source: docs/IMPLEMENTATION_PLAN.md; docs/TEST_SCENARIOS.md
Implementation plan and functional scenarios include custom storefront direct usage through the same enabler/processor. Current planning focuses on Complete Checkout and Payment Only and does not clearly map a custom storefront requirement.

Conflict/gap status: warning in `.planning/INGEST-CONFLICTS.md` because importing it would expand scope unless downstream confirms it is still intended.

## Topic: Nuvei SDK SRI rotation
source: docs/DEPLOYMENT.md; docs/security-review.md; docs/NEXT_STEPS_PLAN.md; .planning/REQUIREMENTS.md
Docs describe Nuvei Web SDK URL and manual SHA-384 SRI recomputation. Security review says there is no automated verification workflow and recommends CI/build-time verification plus documented rotation procedure.

Already represented in planning: SEC-04. Missing/refinement: CI/build-time hash verification can be attached to TEST/SEC planning.

## Topic: Operational readiness
source: docs/DEPLOYMENT.md; docs/NUVEI_SETUP.md; docs/OPERATIONS.md; docs/TEST_SCENARIOS.md; .planning/REQUIREMENTS.md
Operators need accurate deployment commands, Connect env var setup, post-deploy DMN URL setup, pre-undeploy cleanup reminder, health/status checks, sandbox verification, logs, and runbooks for DMN misconfiguration, invalid checksum, auth scopes, deployment failure, Nuvei outage, failed authorization, failed capture, and failed refund.

Already represented in planning: OPS-01 through OPS-06.

## Topic: Readiness claims
source: docs/PLAN.md; docs/TEST_SCENARIOS.md; .planning/PROJECT.md
Docs flag that README/public claims overstate readiness. Current planning already corrected posture to not production-ready and requires sandbox evidence, DMN correctness, CI, and runbooks before readiness claims.

Already represented in planning: yes; stale public-doc readiness claims remain to fix in OPS-06.
