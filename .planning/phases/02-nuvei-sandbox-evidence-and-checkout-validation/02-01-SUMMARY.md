---
phase: 02-nuvei-sandbox-evidence-and-checkout-validation
plan: 01
subsystem: payments-evidence
tags: [nuvei, commercetools-checkout, evidence, sanitizer, validator, npm]

requires:
  - phase: 01.1.1-payment-confirmation-tri-state-outcome-correctness
    provides: Canonical PPP/session/cart identity model used by field-matrix assessments
provides:
  - Phase-local sanitized evidence contract under evidence/
  - Gitignored raw workspace boundary for Phase 2 captures
  - Package-local sanitizer and validator scripts for later evidence stages
affects: [phase-02, phase-03-reconciliation-planning, nuvei-sandbox-evidence]

tech-stack:
  added: []
  patterns:
    - Plain Node ESM evidence helpers using only built-in modules
    - Phase-local evidence manifests plus schema files
    - Stable semantic aliases with committed raw-hash metadata, not raw values

key-files:
  created:
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/findings.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/aliases/alias-map.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/schema/evidence-index.schema.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/schema/fixture-metadata.schema.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/schema/field-matrix.schema.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/schema/findings.schema.json
    - examples/nuvei-web-ui/scripts/evidence-scenarios.mjs
    - examples/nuvei-web-ui/scripts/sanitize-evidence.mjs
    - examples/nuvei-web-ui/scripts/validate-evidence.mjs
  modified:
    - .gitignore
    - examples/nuvei-web-ui/package.json

key-decisions:
  - "Keep Phase 2 evidence tooling package-local in examples/nuvei-web-ui with no new dependencies."
  - "Keep raw values out of committed alias-map.json by storing alias metadata keyed by SHA-256 hashes, while runtime aliasing preserves correlation."
  - "Do not mark NUV-01 through NUV-08 complete from Plan 02-01; this plan establishes evidence slots and validation gates only."

patterns-established:
  - "Raw captures live only under .planning/tmp/phase-02-raw/ and are transformed into phase-local evidence/."
  - "Validator accepts empty pending manifests only with --empty-ok; later captures must satisfy fixture and status rules."
  - "NUV-07 and NUV-08 passed rows require real-commercetools-checkout environment and stage-d-real-commercetools-checkout."

requirements-completed: []
requirements-addressed: [NUV-01, NUV-02, NUV-03, NUV-04, NUV-05, NUV-06, NUV-07, NUV-08]

duration: 10min
completed: 2026-06-08
---

# Phase 02 Plan 01: Evidence Schema, Raw Capture Isolation, Sanitizer, and Validator Summary

**Phase-local evidence contract with raw workspace isolation, deterministic redaction/aliasing, and package-local validation gates for all NUV-01 through NUV-08 scenarios**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-08T11:27:46Z
- **Completed:** 2026-06-08T11:36:55Z
- **Tasks:** 2 completed
- **Files modified:** 13 implementation/evidence files

## Accomplishments

- Added `.planning/tmp/phase-02-raw/` to `.gitignore` before any raw evidence capture work.
- Created the phase-local `evidence/` bundle with index, field matrix, findings, alias map, and schema files.
- Initialized every required Phase 2 scenario row: `NUV-01-success-auth`, `NUV-02-decline-auth`, `NUV-03-3ds-frictionless`, both `NUV-04` rows, all five `NUV-05` rows, `NUV-07-complete-checkout-success`, and `NUV-08-payment-only-success`.
- Added package-local scripts in `examples/nuvei-web-ui`: `sanitize:evidence`, `validate:evidence`, and `evidence:self-check`.
- Implemented sanitizer support for JSON, form-url-encoded bodies, NDJSON, and plain text/log excerpts using only Node built-ins.
- Implemented validator checks for scenario coverage, fixture slots, field-matrix assessment values, findings shape, forbidden sensitive classes, and real Checkout-only pass rules for `NUV-07`/`NUV-08`.

## Task Commits

1. **Task 1: Add raw isolation and evidence manifests before capture** — `76d952d` (`feat`)
2. **Task 2 RED: Add failing evidence self-check** — `5e1c430` (`test`)
3. **Task 2 GREEN: Implement evidence sanitizer and validator** — `632a3de` (`feat`)

**Plan metadata:** recorded in final docs commit.

## Files Created/Modified

- `.gitignore` — ignores `.planning/tmp/phase-02-raw/`.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` — canonical scenario manifest with pending fixture slots and stage/environment rules.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json` — initialized per-scenario identity model matrix against the Phase 1.1.1 PPP/session/cart model.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/findings.json` — empty findings registry with schema-backed shape.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/aliases/alias-map.json` — alias classes, counters, redaction tokens, and raw-hash metadata shape.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/schema/*.schema.json` — parseable JSON schema contracts for manifest, fixture metadata, matrix, and findings.
- `examples/nuvei-web-ui/package.json` — package-local evidence commands.
- `examples/nuvei-web-ui/scripts/evidence-scenarios.mjs` — single scenario catalog used by sanitizer/validator and later capture scripts.
- `examples/nuvei-web-ui/scripts/sanitize-evidence.mjs` — raw-workspace-only sanitizer with semantic aliasing and fixed redactions.
- `examples/nuvei-web-ui/scripts/validate-evidence.mjs` — evidence validator and self-check harness.

## Decisions Made

- Kept all evidence helper code in the existing example package and did not add dependencies.
- Stored committed alias metadata without raw values. Runtime uses raw value hashes to maintain deterministic aliases while avoiding committed session tokens, CT IDs, or Nuvei identifiers.
- Left `NUV-01` through `NUV-08` requirements pending. Plan 02-01 establishes the artifact boundary; later plans provide the actual sandbox and real Checkout evidence.

## Deviations from Plan

None - plan executed within the requested Plan 02-01 boundary. TDD RED/GREEN commits were added because Task 2 had `tdd="true"`.

## Issues Encountered

- The first validator implementation treated fixture slot key `name` as shopper PII and treated the alias-map redaction key `secret` as a leaked secret. Fixed the scanner to avoid generic `name` matching and to allow the controlled `redactions.secret` key while still rejecting secret-like evidence fields.

## Known Stubs

| File | Line | Reason |
| --- | --- | --- |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` | 39 | Intentional `not-captured` / `pending-capture` initial rows. Plan 02-01 creates the contract before raw capture; later Phase 2 plans fill these slots. |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json` | 19 | Intentional `not-captured` / `unobserved` field-matrix placeholders. They are valid only under `validate:evidence -- --empty-ok`. |

## TDD Gate Compliance

- RED commit present: `5e1c430` (`test(02-01): add failing evidence self-check`), verified by `npm --prefix examples/nuvei-web-ui run evidence:self-check` failing with `sanitizeForEvidence not implemented`.
- GREEN commit present after RED: `632a3de` (`feat(02-01): implement evidence sanitizer and validator`).

## Verification

Passed targeted Plan 02-01 checks only:

```bash
npm --prefix examples/nuvei-web-ui run evidence:self-check
npm --prefix examples/nuvei-web-ui run validate:evidence -- --empty-ok
```

Observed result:

- `evidence self-check passed`
- `evidence validation passed`

Task 1 manifest parse/coverage check also passed with a targeted Node command before its commit.

## User Setup Required

None - no external service configuration required for Plan 02-01. Nuvei sandbox credentials and real commercetools Checkout setup remain prerequisites for later Phase 2 evidence capture plans.

## Next Phase Readiness

Plan 02-02 can now write raw server-side capture material only under `.planning/tmp/phase-02-raw/`, sanitize into `evidence/`, update the scenario manifest/field matrix, and rerun `npm --prefix examples/nuvei-web-ui run validate:evidence`.

## Threat Flags

None - new filesystem/script trust boundaries match the Plan 02-01 threat model and are mitigated by raw workspace containment, Node built-ins only, and validator forbidden-pattern checks.

## Self-Check: PASSED

- Created files exist: summary, evidence manifests/schemas, alias map, package scripts, `.gitignore`, and `examples/nuvei-web-ui/package.json`.
- Task commits exist: `76d952d`, `5e1c430`, `632a3de`.

---
*Phase: 02-nuvei-sandbox-evidence-and-checkout-validation*
*Completed: 2026-06-08*
