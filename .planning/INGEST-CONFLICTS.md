## Conflict Detection Report

### BLOCKERS (0)

None.

### WARNINGS (6)

[WARNING] Competing package-manager command variants
  Found: `docs/PLAN.md` says current package layout uses `processor/package-lock.json` and `enabler/package-lock.json`, no root package manifest, no `pnpm-lock.yaml`, and `connect.yaml` runs `npm install`; `docs/TEST_SCENARIOS.md` instructs package-local `npm install`, `npm test`, and `npm run build`.
  Expected: `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `docs/OPERATIONS.md`, `docs/IMPLEMENTATION_PLAN.md`, and `docs/ARCHITECTURE.md` prescribe root `pnpm`, `pnpm --filter`, root `packageManager`, `pnpm-workspace.yaml`, or `pnpm-lock.yaml`.
  Impact: Synthesis cannot choose package strategy without risking command drift. Current `.planning/PROJECT.md` and `.planning/STATE.md` already represent npm/package-local lockfiles as repository reality unless deliberately changed.
  source: `docs/PLAN.md`; `docs/TEST_SCENARIOS.md`; `docs/DEPLOYMENT.md`; `docs/TESTING.md`; `docs/OPERATIONS.md`; `docs/IMPLEMENTATION_PLAN.md`; `docs/ARCHITECTURE.md`; `.planning/PROJECT.md`; `.planning/STATE.md`
  → Choose npm/package-local commands or intentionally migrate to root pnpm, then update docs and Connect scripts consistently.

[WARNING] Competing checksum algorithm policy variants
  Found: `docs/DEPLOYMENT.md` documents `NUVEI_DMN_CHECKSUM_ALGORITHM` as `sha256` only; `docs/IMPLEMENTATION_PLAN.md` says default SHA-256 and do not support MD5 unless Nuvei demonstrably requires it, explicitly feature-flagged and documented as legacy.
  Expected: `docs/NUVEI_SETUP.md` says the algorithm defaults to SHA-256 but can be set to MD5; `docs/OPERATIONS.md` describes legacy MD5 with 32 hex characters; `docs/ARCHITECTURE.md` says signed requests are SHA-256 and configurable to MD5 via `NUVEI_DMN_CHECKSUM_ALGORITHM`.
  Impact: Downstream planning must not silently import MD5 support as normal behavior or delete it if current runtime still exposes it.
  source: `docs/DEPLOYMENT.md`; `docs/IMPLEMENTATION_PLAN.md`; `docs/NUVEI_SETUP.md`; `docs/OPERATIONS.md`; `docs/ARCHITECTURE.md`; `.planning/PROJECT.md`; `.planning/REQUIREMENTS.md`
  → Decide whether MD5 is unsupported, legacy feature-flagged only, or currently supported for Nuvei compatibility; document one policy.

[WARNING] Competing processor endpoint names
  Found: `docs/IMPLEMENTATION_PLAN.md` lists `POST /nuvei/payments`, `POST /nuvei/payments/confirm`, and `POST /nuvei/webhooks`; `docs/ARCHITECTURE.md` uses `POST /payments/confirm`, also mentions `/transactions`, and points DMN processing at `/webhooks/nuvei`.
  Expected: `docs/TEST_SCENARIOS.md`, `.planning/REQUIREMENTS.md`, and Phase 1 context use `POST /payments`, `POST /payments/confirmPayments/:paymentId`, `POST /payment-intents/:paymentId`, and `POST /webhooks/nuvei`. `docs/PAYMENT_CONFIRMATION_POLLING.md` proposes a future `POST /payments/:paymentId/status` endpoint.
  Impact: Route-level tests, public docs, and enabler/processor contracts can drift if endpoint aliases are assumed.
  source: `docs/IMPLEMENTATION_PLAN.md`; `docs/ARCHITECTURE.md`; `docs/TEST_SCENARIOS.md`; `docs/PAYMENT_CONFIRMATION_POLLING.md`; `.planning/REQUIREMENTS.md`; `.planning/phases/01-contract-and-method-hardening/01-CONTEXT.md`
  → Pick canonical endpoint names and mark older names as obsolete or unsupported.

[WARNING] Drop-in versus embedded terminology conflict
  Found: `.planning/STATE.md` and Phase 1 context state the enabler registry uses `embedded`, not `dropin`, and processor accepts exactly `card` and transitional `embedded`; `dropin` is not a processor payment method alias.
  Expected: `docs/NEXT_STEPS_PLAN.md`, `docs/TEST_SCENARIOS.md`, and `docs/PLAN.md` sometimes use drop-in generically, and `docs/TEST_SCENARIOS.md` expects `paymentMethodOptions.dropin` for embedded drop-in success.
  Impact: Synthesis cannot normalize both names without potentially introducing an unsupported alias.
  source: `.planning/STATE.md`; `.planning/phases/01-contract-and-method-hardening/01-CONTEXT.md`; `docs/NEXT_STEPS_PLAN.md`; `docs/TEST_SCENARIOS.md`; `docs/PLAN.md`
  → Keep `embedded` as the canonical key unless a new decision explicitly adds a `dropin` alias.

[WARNING] Custom storefront direct usage is not clearly represented in current planning
  Found: `docs/IMPLEMENTATION_PLAN.md` says the connector can also be used by a custom checkout storefront using the same enabler/processor, and `docs/TEST_SCENARIOS.md` includes Scenario 28 for custom storefront direct usage.
  Expected: Current `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` focus v1 on Complete Checkout, Payment Only, card reconciliation, data/security, CI, and operations, with no explicit custom storefront requirement or roadmap phase.
  Impact: Importing this as an active requirement may expand scope; dropping it may lose source intent.
  source: `docs/IMPLEMENTATION_PLAN.md`; `docs/TEST_SCENARIOS.md`; `.planning/REQUIREMENTS.md`; `.planning/ROADMAP.md`; `.planning/PROJECT.md`
  → Decide whether custom storefront direct usage is v1 scope, a validation scenario, or deferred/out-of-scope.

[WARNING] Readiness claim drift remains to be cleaned up
  Found: `docs/PLAN.md` says README claims production-ready and MVP-complete while production-critical gaps remain; `.planning/PROJECT.md` says the project is not production-ready until sandbox E2E validation, DMN correlation, reconciliation correctness, security hardening, deployment repeatability, and CI gates are proven.
  Expected: `docs/TEST_SCENARIOS.md` says the connector is functionally complete only after sandbox Checkout/Payment Only, 3DS/decline safety, DMN idempotency, operations, mismatch rejection, CI, and doc accuracy are proven.
  Impact: Public docs may mislead operators unless OPS-06 updates readiness claims to match observed evidence.
  source: `docs/PLAN.md`; `docs/TEST_SCENARIOS.md`; `.planning/PROJECT.md`; `.planning/REQUIREMENTS.md`
  → Update README/public docs during the operational readiness phase or earlier if docs are user-facing now.

### INFO (7)

[INFO] Cross-reference cycle check passed
  Found: The re-run classification for `docs/ARCHITECTURE.md` no longer lists `docs/ARCHITECTURE.md` as a self-reference, and no cross-reference cycle was detected within the 11-document ingest set.
  Note: All classified documents participated in synthesis.
  source: `.planning/intel/classifications/ARCHITECTURE-ff21b6b9.json`; `.planning/intel/classifications/`

[INFO] Auto-resolved: no LOCKED ADR contradictions found
  Found: All 11 classifications are DOC/high confidence with `locked: false`; no ADR-classified locked decisions were present.
  Note: Locked-vs-locked and locked-ingest-vs-existing checks found no decision conflict.
  source: `.planning/intel/classifications/`; `.planning/phases/01-contract-and-method-hardening/01-CONTEXT.md`; `.planning/STATE.md`

[INFO] Existing planning already represents card-first reconciliation priority
  Found: Docs requiring card-first scope, sandbox evidence, DMN correlation, idempotency, and operation correctness align with current project planning.
  Note: No precedence conflict was detected for the card-first baseline.
  source: `docs/PLAN.md`; `docs/NEXT_STEPS_PLAN.md`; `docs/IMPLEMENTATION_PLAN.md`; `docs/TEST_SCENARIOS.md`; `.planning/PROJECT.md`; `.planning/REQUIREMENTS.md`; `.planning/ROADMAP.md`

[INFO] Existing planning already represents native Payment fields / no Custom Types
  Found: `docs/IMPLEMENTATION_PLAN.md` and `docs/ARCHITECTURE.md` say to use native commercetools Payment fields and avoid Custom Types unless proven necessary.
  Note: `.planning/PROJECT.md` and `.planning/REQUIREMENTS.md` already carry this policy.
  source: `docs/IMPLEMENTATION_PLAN.md`; `docs/ARCHITECTURE.md`; `.planning/PROJECT.md`; `.planning/REQUIREMENTS.md`

[INFO] Security review findings added as missing/refinement intel rather than auto-overriding roadmap
  Found: HTTPS `processorUrl`, unsigned DMN field distrust, persistent replay TTL, return URL allowlist, payment creation idempotency, amount bounds, and SRI verification appear in `docs/security-review.md`.
  Note: These are synthesized as missing/refinement items for future phase planning.
  source: `docs/security-review.md`; `.planning/intel/requirements.md`; `.planning/intel/constraints.md`; `.planning/intel/context.md`

[INFO] Checkout pending/polling plan fits existing frontend/security phases
  Found: `docs/PAYMENT_CONFIRMATION_POLLING.md` defines tri-state outcome and bounded enabler polling.
  Note: This maps to existing SEC-01 and SEC-02 requirements without contradicting locked decisions.
  source: `docs/PAYMENT_CONFIRMATION_POLLING.md`; `.planning/REQUIREMENTS.md`; `.planning/ROADMAP.md`

[INFO] UNKNOWN low-confidence blocker check passed
  Found: No classification in `.planning/intel/classifications/` was `UNKNOWN` with low confidence.
  Note: No retagging blocker was added.
  source: `.planning/intel/classifications/`

## Merge Resolution Applied 2026-06-02

- Package-manager conflict: resolved in favor of current `.planning` and repository reality — package-local npm commands with `processor/package-lock.json` and `enabler/package-lock.json` unless deliberately migrated later.
- Checksum algorithm conflict: imported as `OPS-07`; downstream planning must resolve and document one public policy before docs are pruned.
- Endpoint-name conflict: resolved in favor of current route names from `.planning` and Phase 1 context: `/payments`, `/payments/confirmPayments/:paymentId`, `/payment-intents/:paymentId`, `/webhooks/nuvei`; old `/nuvei/*` names are stale unless deliberately reintroduced.
- Drop-in terminology conflict: resolved in favor of Phase 1 decision — `embedded` is the transitional drop-in request key; `dropin` is not a processor method alias.
- Custom storefront direct usage: deferred to v2 as `CUST-01` unless explicitly promoted after hosted Checkout and Payment Only card reconciliation are proven.
- Readiness claim drift: remains assigned to `OPS-06`; public docs must not claim production-ready status before sandbox E2E, reconciliation, fixtures, CI, and operations evidence exist.
- Security-review refinements imported into requirements: `RECON-11`, `RECON-12`, `RECON-13`, `RECON-14`, `DATA-06`, and `SEC-09`.
