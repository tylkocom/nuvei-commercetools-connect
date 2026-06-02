# Ingest Synthesis Summary

source: .planning/intel/classifications/*.json
mode: merge
conflicts report: .planning/INGEST-CONFLICTS.md

## Document counts

Total synthesized: 11

- ADR: 0
- SPEC: 0
- PRD: 0
- DOC: 11
- UNKNOWN low-confidence: 0

Consumed classifications:

- docs/ARCHITECTURE.md — DOC/high
- docs/PLAN.md — DOC/high
- docs/NUVEI_SETUP.md — DOC/high
- docs/TESTING.md — DOC/high
- docs/NEXT_STEPS_PLAN.md — DOC/high
- docs/IMPLEMENTATION_PLAN.md — DOC/high
- docs/DEPLOYMENT.md — DOC/high
- docs/security-review.md — DOC/high
- docs/TEST_SCENARIOS.md — DOC/high
- docs/PAYMENT_CONFIRMATION_POLLING.md — DOC/high
- docs/OPERATIONS.md — DOC/high

Cycle detection: passed. No cross-reference cycles detected after the `docs/ARCHITECTURE.md` self-reference removal.

## Decisions

Locked decisions: 0

Non-locked decision candidates extracted: 9

- Card-first connector scope — source: docs/IMPLEMENTATION_PLAN.md; docs/PLAN.md; docs/NEXT_STEPS_PLAN.md; .planning/PROJECT.md
- Standard Connect payment architecture — source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; .planning/PROJECT.md
- Source-of-truth model — source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; .planning/PROJECT.md
- Native commercetools Payment fields only — source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; .planning/PROJECT.md; .planning/REQUIREMENTS.md
- Authorization-first lifecycle — source: docs/IMPLEMENTATION_PLAN.md; docs/NUVEI_SETUP.md; docs/TEST_SCENARIOS.md; docs/ARCHITECTURE.md
- Mirrored method registries for current phase — source: .planning/phases/01-contract-and-method-hardening/01-CONTEXT.md; .planning/STATE.md
- Embedded drop-in transitional support — source: .planning/phases/01-contract-and-method-hardening/01-CONTEXT.md; .planning/STATE.md; docs/NEXT_STEPS_PLAN.md; docs/TEST_SCENARIOS.md
- Browser polling owns pending confirmation cadence — source: docs/PAYMENT_CONFIRMATION_POLLING.md; .planning/REQUIREMENTS.md
- Package manager strategy remains unsettled across docs — source: docs/PLAN.md; docs/TEST_SCENARIOS.md; docs/DEPLOYMENT.md; docs/TESTING.md; docs/IMPLEMENTATION_PLAN.md; docs/OPERATIONS.md; docs/ARCHITECTURE.md; .planning/PROJECT.md; .planning/STATE.md

Detail: .planning/intel/decisions.md

## Requirements

Requirements extracted: 13

- REQ-contract-method-hardening
- REQ-nuvei-sandbox-evidence
- REQ-dmn-correlation-and-idempotency
- REQ-payment-creation-idempotency
- REQ-checkout-data-and-return-url
- REQ-frontend-resilience-and-pending
- REQ-security-hardening
- REQ-money-moving-amount-validation
- REQ-testing-and-fixtures
- REQ-ci-and-package-command-drift
- REQ-deployment-and-operations
- REQ-readiness-claims
- REQ-custom-storefront-direct-usage

Detail: .planning/intel/requirements.md

## Constraints

Constraints extracted: 31

Type breakdown:

- api-contract: 9
- schema: 3
- nfr: 11
- protocol: 9

Detail: .planning/intel/constraints.md

## Context topics

Context topics extracted: 14

- Current project posture
- Package-manager and command drift
- Checksum algorithm policy
- Endpoint naming drift
- Drop-in and embedded terminology
- DMN correlation and replay risk
- Payment creation idempotency
- HTTPS processorUrl
- Return URL allowlist
- Money-moving amount validation
- Custom storefront direct usage
- Nuvei SDK SRI rotation
- Operational readiness
- Readiness claims

Detail: .planning/intel/context.md

## Conflicts

- Blockers: 0
- Competing variants / warnings: 6
- Auto-resolved / info: 7

Report: .planning/INGEST-CONFLICTS.md

## Downstream notes

- No BLOCKER remains from the prior `docs/ARCHITECTURE.md` self-cycle.
- Existing planning remains the source of truth for current roadmap scope until warning items are resolved.
- Missing/refinement items from `docs/security-review.md` were preserved as intel, not written into destination planning files.
