---
phase: 02-nuvei-sandbox-evidence-and-checkout-validation
plan: 05
subsystem: payments-evidence
tags: [nuvei, commercetools-checkout, evidence, stage-d, npm]

requires:
  - phase: 02-nuvei-sandbox-evidence-and-checkout-validation
    provides: Plan 02-01 evidence schema/sanitizer/validator, Plan 02-02 Stage A processor evidence, Plan 02-03 Stage B browser blocker contract, and Plan 02-04 Stage C DMN/operation blocker contract
provides:
  - Stage D real Checkout evidence ingester and phase gate for NUV-07 and NUV-08
  - Strict gate rules that reject mock/local proof for Complete Checkout and Payment Only pass status
  - Exact blocked-incomplete Phase 2 evidence handoff when real CT raw proof is unavailable
affects: [phase-03-reconciliation-planning, phase-07-operations-readiness, nuvei-sandbox-evidence, commercetools-checkout]

tech-stack:
  added: []
  patterns:
    - Package-local Node ESM Stage D evidence ingester with no new dependencies
    - Detailed real Checkout environment labels for Complete Checkout and Payment Only evidence rows
    - Machine-readable blocked-incomplete phase gate instead of false completion

key-files:
  created:
    - examples/nuvei-web-ui/scripts/real-checkout-gate-self-check.mjs
    - examples/nuvei-web-ui/scripts/capture-real-checkout.mjs
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-07-complete-checkout-success/metadata.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-08-payment-only-success/metadata.json
  modified:
    - examples/nuvei-web-ui/package.json
    - examples/nuvei-web-ui/scripts/evidence-scenarios.mjs
    - examples/nuvei-web-ui/scripts/validate-evidence.mjs
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/findings.json

key-decisions:
  - "Keep Stage D capture package-local in examples/nuvei-web-ui with no new dependencies."
  - "Use scenario-specific real Checkout environment labels: commercetools-sandbox-complete-checkout and commercetools-sandbox-payment-only."
  - "Leave Phase 2 blocked/incomplete when NUV-07 and NUV-08 lack real CT Checkout proof; do not convert local mock evidence into pass evidence."

patterns-established:
  - "capture:real-checkout ingests raw Stage D exports only from .planning/tmp/phase-02-raw/stage-d/<scenario>/ and writes sanitized fixtures under evidence/."
  - "validate:phase-2-gate --require-real-checkout fails unless both NUV-07 and NUV-08 are passed from real Checkout proof classes."
  - "validate:phase-2-gate --strict accepts a blocked-incomplete handoff only when every blocked row has exact blocker metadata."

requirements-completed: []
requirements-addressed: [NUV-06, NUV-07, NUV-08]

duration: 8min
completed: 2026-06-08
---

# Phase 02 Plan 05: Real Checkout Smoke Gate and Final Evidence Handoff Summary

**Stage D real Checkout gate with blocker-backed NUV-07/NUV-08 handoff and no false commercetools Checkout pass evidence**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-08T12:24:44Z
- **Completed:** 2026-06-08T12:32:34Z
- **Tasks:** 3 completed
- **Files modified:** 11 implementation/evidence files plus this summary

## Accomplishments

- Added `capture:real-checkout`, a Node built-in Stage D ingester for raw Complete Checkout and Payment Only exports under `.planning/tmp/phase-02-raw/stage-d/<scenario>/`.
- Added `validate:phase-2-gate`, which enforces proof classes for UI, CT ledger, processor, and Nuvei/DMN evidence and rejects mock/local pass status for `NUV-07` and `NUV-08`.
- Updated the evidence catalog/validator to use detailed real Checkout labels: `commercetools-sandbox-complete-checkout` and `commercetools-sandbox-payment-only`.
- Ran the real Checkout gate. No real Stage D raw export directories existed, so `capture:real-checkout` returned the missing-raw-proof blocker path and `--require-real-checkout` correctly returned non-zero rather than passing.
- Recorded exact blockers for `NUV-07-complete-checkout-success` and `NUV-08-payment-only-success`, including required proof classes, required fixture names, expected raw directories, dashboard prerequisites, and no-fake-evidence policy.
- Added `index.json.phaseGate.status = blocked-incomplete`; Phase 2 is explicitly not complete because real Complete Checkout and Payment Only evidence is unavailable.

## Task Commits

1. **Task 1 RED: Add failing real Checkout gate self-check** — `2453098` (`test`)
2. **Task 1 GREEN: Add real Checkout evidence gate** — `2ca647e` (`feat`)
3. **Task 1 fix: Scope cross-stage fixture validation** — `ce1e1fb` (`fix`)
4. **Task 2: Record real Checkout evidence blockers** — `208fd19` (`feat`)
5. **Task 3: Finalize blocked-incomplete Phase 2 gate status** — `fd9af4b` (`feat`)

**Plan metadata:** recorded in final docs commit.

## Files Created/Modified

- `examples/nuvei-web-ui/package.json` — Adds `capture:real-checkout`, `validate:phase-2-gate`, and `real-checkout:self-check` package-local commands.
- `examples/nuvei-web-ui/scripts/real-checkout-gate-self-check.mjs` — TDD/static self-check for Stage D scripts, labels, and proof-class gates.
- `examples/nuvei-web-ui/scripts/capture-real-checkout.mjs` — Ingests real Checkout raw exports, sanitizes fixture files, records blockers, and validates Stage D/Phase 2 gate states.
- `examples/nuvei-web-ui/scripts/evidence-scenarios.mjs` — Replaces old combined NUV-07/NUV-08 fixture slots with explicit Stage D proof fixture names.
- `examples/nuvei-web-ui/scripts/validate-evidence.mjs` — Accepts detailed real Checkout labels and keeps stage-scoped validation from failing on future-stage pending slot migrations.
- `evidence/index.json` — Adds detailed Stage D blocker rows and a top-level blocked-incomplete phase gate.
- `evidence/field-matrix.json` — Marks `NUV-07` and `NUV-08` identity assessments as blocked with metadata evidence refs.
- `evidence/findings.json` — Adds high-severity Stage D blocker findings for `NUV-07` and `NUV-08`.
- `evidence/NUV-07-complete-checkout-success/metadata.json` — Sanitized blocker metadata for missing Complete Checkout proof.
- `evidence/NUV-08-payment-only-success/metadata.json` — Sanitized blocker metadata for missing Payment Only proof.

## Decisions Made

- Kept Stage D automation in the existing example package and added no dependencies.
- Used explicit `commercetools-sandbox-complete-checkout` and `commercetools-sandbox-payment-only` labels so Complete Checkout and Payment Only rows cannot be confused with local mock evidence.
- Treated missing Stage D raw directories as blockers, not conditions to work around. This preserves the execution contract: no fake real CT Checkout evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Scoped evidence fixture validation by active stage**
- **Found during:** Task 2 Stage C precondition check after Task 1 changed NUV-07/NUV-08 fixture slots.
- **Issue:** `validate:evidence -- --stage stage-c ...` returned non-zero on future Stage D fixture slots even though Stage D had not been captured or blocked yet.
- **Fix:** `validate-evidence.mjs` now ignores missing fixture slots for scenarios outside the requested stage while preserving strict/no-stage validation for final handoff.
- **Files modified:** `examples/nuvei-web-ui/scripts/validate-evidence.mjs`
- **Verification:** `npm --prefix examples/nuvei-web-ui run validate:evidence -- --stage stage-c --require-scenarios NUV-01-success-auth,NUV-05-capture,NUV-05-cancel-authorization,NUV-05-refund,NUV-05-duplicate-dmn,NUV-05-mismatch`
- **Committed in:** `ce1e1fb`

---

**Total deviations:** 1 auto-fixed bug
**Impact on plan:** Required to keep Stage C validation usable after Stage D fixture slot migration. No broad gates, docs cleanup, or project-wide checks were added.

## Issues Encountered

- `npm --prefix examples/nuvei-web-ui run capture:real-checkout` returned the expected blocker path: `NUV-07-complete-checkout-success: missing raw directory .planning/tmp/phase-02-raw/stage-d/NUV-07-complete-checkout-success`. No real CT evidence was fabricated.
- `npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --require-real-checkout` returned non-zero with both real Checkout rows blocked. This is the required outcome when real Complete Checkout and Payment Only proof is unavailable.

## Known Stubs

| File | Location | Reason |
| --- | --- | --- |
| `evidence/index.json` | `NUV-07-complete-checkout-success` required fixture slots | `checkout-ui-evidence.json`, CT ledger, processor, Nuvei dashboard, and DMN fixtures are intentionally `present: false` because no real Complete Checkout raw export exists. Row status is `blocked`, not passed. |
| `evidence/index.json` | `NUV-08-payment-only-success` required fixture slots | Payment Only proof fixture slots are intentionally `present: false` because no real Payment Only raw export exists. Row status is `blocked`, not passed. |
| `evidence/field-matrix.json` | `NUV-07` and `NUV-08` matrix rows | CT/Nuvei identity values remain `unobserved` and all identity assessments are `blocked` until real CT Checkout evidence is captured. |

## Threat Flags

| Flag | File | Description |
| --- | --- | --- |
| `threat_flag: real-checkout-raw-ingester` | `examples/nuvei-web-ui/scripts/capture-real-checkout.mjs` | Adds an ingestion path for real CT/Nuvei raw exports. Mitigated by raw workspace containment, sanitizer/aliasing, proof-class validation, mock/local pass rejection, and forbidden raw output validation. |
| `threat_flag: real-checkout-blocker-status` | `evidence/index.json` | Adds blocked real Checkout rows with target environment labels but no pass claim. Mitigated by `phaseGate.phaseComplete=false`, `status=blocked`, and a non-zero `validate:phase-2-gate --require-real-checkout` result. |

## TDD Gate Compliance

- Task 1 RED commit present: `2453098` (`test(02-05): add failing real checkout gate self-check`), observed failing on missing `capture-real-checkout.mjs`.
- Task 1 GREEN commit present after RED: `2ca647e` (`feat(02-05): add real checkout evidence gate`).
- Task 1 fix commit after GREEN: `ce1e1fb` (`fix(02-05): keep stage validation scoped`).

## Checks Run

Passed targeted Plan 02-05 checks only:
```bash
npm --prefix examples/nuvei-web-ui run real-checkout:self-check
npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --allow-pending-real-checkout
npm --prefix examples/nuvei-web-ui run validate:evidence -- --stage stage-c --require-scenarios NUV-01-success-auth,NUV-05-capture,NUV-05-cancel-authorization,NUV-05-refund,NUV-05-duplicate-dmn,NUV-05-mismatch
npm --prefix examples/nuvei-web-ui run capture:real-checkout -- --record-blocker
npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --strict
npm --prefix examples/nuvei-web-ui run validate:evidence -- --forbid-raw-output
```

Observed results:

- `real Checkout gate self-check passed`
- `real Checkout gate validation passed`
- Stage C evidence validation passed after scoped validator fix.
- `real Checkout blockers recorded`
- `phase 2 gate validation passed (blocked rows remain incomplete)`
- `evidence validation passed`

Required real-checkout gate intentionally returned non-zero because real proof is unavailable:

```bash
npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --require-real-checkout
```

Observed result:

```text
NUV-07-complete-checkout-success: real Checkout evidence required but row is blocked
NUV-08-payment-only-success: real Checkout evidence required but row is blocked
```

No project-wide build/test/lint/format was run.

## User Setup Required

To replace blocker fixtures with real Stage D evidence:

1. Create/identify a real commercetools Complete Checkout session using the Nuvei connector and a non-zero physical-goods cart.
2. Create/identify a real commercetools Payment Only Checkout session with required cart shipping and billing data.
3. Ensure the processor/enabler endpoint used by Checkout is the same endpoint whose processor evidence/logs are exported.
4. Ensure Nuvei sandbox dashboard/control panel can show the same transaction and send DMN to the processor endpoint.
5. Save raw JSON/transcription exports under:
   - `.planning/tmp/phase-02-raw/stage-d/NUV-07-complete-checkout-success/`
   - `.planning/tmp/phase-02-raw/stage-d/NUV-08-payment-only-success/`
6. Rerun `npm --prefix examples/nuvei-web-ui run capture:real-checkout`, then `npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --require-real-checkout`.

## Next Phase Readiness

- Phase 3 planning can inspect the Phase 2 fixture bundle, but it must treat `NUV-07`, `NUV-08`, and all blocked Stage C DMN/operation rows as blockers, not confirmed behavior.
- Phase 2 remains incomplete: `evidence/index.json.phaseGate.phaseComplete` is `false`, and `NUV-07`/`NUV-08` are blocked pending real commercetools Checkout evidence.
- No production readiness claim should be made until `validate:phase-2-gate -- --require-real-checkout` passes with real Complete Checkout and Payment Only proof.

## Auth Gates

None. No auth CLI/API gate was encountered; the blocker is absence of verified Stage D raw proof, not an authenticated API issue.

## Self-Check: PASSED

- Created files exist: summary, real Checkout gate self-check, real Checkout capture/gate script, and both Stage D blocker metadata files.
- Task commits exist: `2453098`, `2ca647e`, `ce1e1fb`, `208fd19`, `fd9af4b`.
- Working tree after self-check contained only this uncommitted summary before metadata/state updates.

---
*Phase: 02-nuvei-sandbox-evidence-and-checkout-validation*
*Completed: 2026-06-08*
