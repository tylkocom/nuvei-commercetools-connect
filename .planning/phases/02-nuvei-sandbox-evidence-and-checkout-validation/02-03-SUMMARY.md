---
phase: 02-nuvei-sandbox-evidence-and-checkout-validation
plan: 03
subsystem: payments-evidence
tags: [nuvei, browser-evidence, simply-connect, web-sdk, stage-b, npm]

requires:
  - phase: 02-nuvei-sandbox-evidence-and-checkout-validation
    provides: Plan 02-01 evidence schema/sanitizer/validator and Plan 02-02 Stage A local processor evidence setup
provides:
  - Structured Stage B browser evidence export controls in the dual-mode local harness
  - Package-local Stage B browser-export ingestion and blocker recording script
  - Stage B validator flags for pending-human-capture and required scenario/blocker checks
  - Sanitized blocker-path fixtures for NUV-01 through NUV-04 local browser scenarios without fake browser or Nuvei evidence
affects: [phase-02-stage-c, phase-02-stage-d, phase-03-reconciliation-planning, nuvei-browser-evidence]

tech-stack:
  added: []
  patterns:
    - Browser harness exports structured JSON with scenarioId, frontendMode, script URL class, callback events, and operator notes
    - Stage B ingester reads only from .planning/tmp/phase-02-raw/stage-b/ and sanitizes into phase-local evidence folders
    - Blocker-path evidence is first-class and validated for unavailable browser/Nuvei interaction

key-files:
  created:
    - examples/nuvei-web-ui/scripts/stage-b-browser-export-self-check.mjs
    - examples/nuvei-web-ui/scripts/capture-stage-b.mjs
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-02-decline-auth/metadata.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-03-3ds-frictionless/metadata.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-04-3ds-stepup-success/metadata.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-04-3ds-stepup-failure-or-abandonment/metadata.json
  modified:
    - examples/nuvei-web-ui/index.html
    - examples/nuvei-web-ui/package.json
    - examples/nuvei-web-ui/scripts/validate-evidence.mjs
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/findings.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/metadata.json

key-decisions:
  - "Keep Stage B browser capture package-local in examples/nuvei-web-ui with no new dependencies."
  - "Treat Simply Connect as the primary Stage B row mode while recording Web SDK blockers/findings explicitly when no Web SDK browser export exists."
  - "Do not infer or fake browser/Nuvei results in non-interactive execution; record exact blocker fixtures instead."

patterns-established:
  - "Stage B raw exports belong under .planning/tmp/phase-02-raw/stage-b/<scenario>/<frontendMode>/ and are ingested into sanitized scenario fixtures."
  - "Browser evidence export records URL/script classes and callback summaries, not full processor URLs, raw Nuvei session tokens, credentials, checksums, or shopper payment data."
  - "Stage B validation accepts either captured browser evidence or exact blocker metadata for required local browser scenarios."

requirements-completed: []
requirements-addressed: [NUV-01, NUV-02, NUV-03, NUV-04, NUV-06]

duration: 8min
completed: 2026-06-08
---

# Phase 02 Plan 03: Stage B Dual-Mode Browser Capture Summary

**Dual-mode local browser evidence harness with reproducible Stage B export/ingest flow and validated blocker fixtures when live browser/Nuvei interaction was unavailable**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-08T12:01:53Z
- **Completed:** 2026-06-08T12:09:24Z
- **Tasks:** 3 completed
- **Files modified:** 31 implementation/evidence files

## Accomplishments

- Extended `examples/nuvei-web-ui/index.html` with Stage B scenario selection, operator notes, a structured evidence buffer, and an `Export Evidence` control.
- Instrumented the harness to record `scenarioId`, `frontendMode`, mount/pay/callback events, script URL class (`checkout.js` / `safecharge.js` / `not-observed`), processor URL class, session ID alias candidate metadata, and sanitized callback summaries.
- Added `npm --prefix examples/nuvei-web-ui run capture:stage-b`, which ingests raw browser exports from `.planning/tmp/phase-02-raw/stage-b/<scenario>/<frontendMode>/` or records exact blocker fixtures with no fake browser/Nuvei evidence.
- Extended `validate:evidence` with `--stage stage-b`, `--allow-pending-human-capture`, and `--require-scenarios` enforcement for Stage B captured-or-blocked rows.
- Recorded sanitized blocker-path fixtures for `NUV-01-success-auth`, `NUV-02-decline-auth`, `NUV-03-3ds-frictionless`, `NUV-04-3ds-stepup-success`, and `NUV-04-3ds-stepup-failure-or-abandonment` because no interactive browser automation/tooling or operator-provided raw browser exports were available in this executor environment.
- Recorded Web SDK blockers/findings for every required Stage B scenario instead of silently treating Simply Connect as the only frontend mode.

## Task Commits

1. **Task 1 RED: Add failing browser export self-check** — `abcd521` (`test`)
2. **Task 1 GREEN: Add Stage B browser evidence export** — `9fefe2c` (`feat`)
3. **Task 2 RED: Add failing Stage B capture runner** — `69f7135` (`test`)
4. **Task 2 GREEN: Add Stage B evidence ingestion** — `66ca732` (`feat`)
5. **Task 2 fix: Record Web SDK Stage B blockers** — `b7e76c4` (`fix`)
6. **Task 3: Record Stage B browser blockers** — `bb6789c` (`feat`)

**Plan metadata:** recorded in final docs commit.

## Files Created/Modified

- `examples/nuvei-web-ui/index.html` — Adds Stage B scenario selector, operator notes, structured evidence buffer, fetch observation, callback event capture, and export/download/copy control.
- `examples/nuvei-web-ui/scripts/stage-b-browser-export-self-check.mjs` — Static targeted check for required scenario/export tokens and forbidden card-field terms.
- `examples/nuvei-web-ui/package.json` — Adds `capture:stage-b` package-local command.
- `examples/nuvei-web-ui/scripts/capture-stage-b.mjs` — Ingests raw Stage B browser exports or records blocker fixtures and Web SDK findings.
- `examples/nuvei-web-ui/scripts/validate-evidence.mjs` — Adds Stage B validation flags and required-scenario captured-or-blocked checks.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` — Marks required Stage B rows as blocked with exact Simply Connect and Web SDK blocker metadata.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json` — Records Stage B frontend mode/environment and blocked identity assessments for unavailable browser capture.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/findings.json` — Adds Web SDK not-exercised findings for all required Stage B scenarios.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/*` — Adds Stage B blocker browser/status/CT snapshot fixtures while preserving Stage A server setup evidence.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-02-decline-auth/*`, `NUV-03-3ds-frictionless/*`, `NUV-04-3ds-stepup-success/*`, `NUV-04-3ds-stepup-failure-or-abandonment/*` — Adds metadata, browser-result, status, and CT after-confirm blocker fixtures.

## Decisions Made

- Kept Stage B automation in the existing example package and added no dependencies.
- Made blocker-path evidence explicit and validator-backed because this executor had no live interactive browser/Nuvei path and no raw operator exports to ingest.
- Kept local Stage B evidence from satisfying `NUV-07` or `NUV-08`; those remain Stage D real commercetools Checkout gates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added explicit Web SDK blocker rows when blocker capture records Simply Connect as the primary mode**
- **Found during:** Task 2 (Stage B ingestion implementation)
- **Issue:** The evidence index has one `frontendMode` per scenario, but Plan 02-03 requires Web SDK feasibility or blockers to be recorded separately from Simply Connect.
- **Fix:** `capture-stage-b.mjs` now records Simply Connect as the primary Stage B row mode and also adds Web SDK blocker metadata plus `findings.json` entries for each required scenario.
- **Files modified:** `examples/nuvei-web-ui/scripts/capture-stage-b.mjs`, `evidence/index.json`, `evidence/findings.json`
- **Verification:** `npm --prefix examples/nuvei-web-ui run validate:evidence -- --stage stage-b --require-scenarios NUV-01-success-auth,NUV-02-decline-auth,NUV-03-3ds-frictionless,NUV-04-3ds-stepup-success,NUV-04-3ds-stepup-failure-or-abandonment`
- **Committed in:** `b7e76c4`, `bb6789c`

---

**Total deviations:** 1 auto-fixed (missing critical evidence metadata)
**Impact on plan:** Required to satisfy D-29 without faking Web SDK browser evidence. No Stage C tunnel, real Checkout smoke, broad build/test/lint, or extra dependency work was added.

## Issues Encountered

- Live local browser/Nuvei interaction was unavailable in this non-interactive executor environment, and no raw exports existed under `.planning/tmp/phase-02-raw/stage-b/<scenario>/<frontendMode>/`. The ingester recorded exact blocker fixtures instead of fake browser evidence.
- Browser callback evidence alone remains non-final by design. Stage B fixtures are blocked or pending local browser evidence; Stage C still owns combined browser + processor + DMN/status evidence.

## Known Stubs

| File | Line | Reason |
| --- | --- | --- |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` | NUV-01..NUV-04 rows | Stage B rows are intentionally `blocked` with exact blocker fixtures because no live browser/Nuvei capture was available. This does not satisfy the underlying Nuvei scenario requirements. |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json` | NUV-01..NUV-04 rows | Identity assessments are `blocked` for Stage B browser capture. Stage C must still observe browser/status/DMN identifiers before Phase 3 planning relies on these fields. |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` | NUV-07 and NUV-08 rows | Real commercetools Checkout evidence remains intentionally not captured; local Stage B cannot satisfy these rows. |

## Threat Flags

None - new browser/export/raw-ingest surfaces match the Plan 02-03 threat model and are mitigated by structured export, raw workspace containment, sanitizer/validator checks, and blocker fixtures instead of fake evidence.

## TDD Gate Compliance

- Task 1 RED commit present: `abcd521` (`test(02-03): add failing browser export self-check`), observed failing on missing `NUV-01-success-auth` / export tokens before implementation.
- Task 1 GREEN commit present after RED: `9fefe2c` (`feat(02-03): add Stage B browser evidence export`).
- Task 2 RED commit present: `69f7135` (`test(02-03): add failing Stage B capture runner`), observed failing with `capture-stage-b not implemented`.
- Task 2 GREEN commit present after RED: `66ca732` (`feat(02-03): add Stage B evidence ingestion`).

## Verification

Passed targeted Plan 02-03 checks only:

```bash
node examples/nuvei-web-ui/scripts/stage-b-browser-export-self-check.mjs
npm --prefix examples/nuvei-web-ui run validate:evidence -- --stage stage-b --allow-pending-human-capture
npm --prefix examples/nuvei-web-ui run validate:evidence -- --stage stage-b --require-scenarios NUV-01-success-auth,NUV-02-decline-auth,NUV-03-3ds-frictionless,NUV-04-3ds-stepup-success,NUV-04-3ds-stepup-failure-or-abandonment
```

Observed results:

- `stage B browser export self-check passed`
- `evidence validation passed`
- `evidence validation passed`

Also ran `capture:stage-b --record-blocker` for all five required Stage B scenarios and observed `stage B blocked for <scenario> (simply-connect)` for each.

## User Setup Required

To replace blocker fixtures with real Stage B browser evidence:

1. Start the mock CT server: `npm --prefix examples/nuvei-web-ui start`.
2. Start the local processor pointed at mock CT with `PHASE_02_STAGE_A_LOCAL_MOCK_CT=true` and real Nuvei sandbox env vars.
3. Open `examples/nuvei-web-ui/index.html` in a browser.
4. Export raw evidence for each scenario/mode under `.planning/tmp/phase-02-raw/stage-b/<scenario>/<frontendMode>/`.
5. Run `npm --prefix examples/nuvei-web-ui run capture:stage-b -- --scenario <scenario> --frontend-mode <simply-connect|web-sdk>` and rerun the Stage B validator.

## Next Phase Readiness

- Plan 02-04 can reuse the Stage B export/ingest contract and should replace blockers with actual browser evidence before relying on DMN/status field conclusions.
- Plan 02-04 still owns Stage C DMN tunnel, `getPaymentStatus`/DMN evidence, operations, duplicate, and mismatch rows.
- Plan 02-05 remains the only plan that can satisfy `NUV-07` and `NUV-08` with real commercetools Checkout evidence.

## Self-Check: PASSED

- Created files exist: summary, Stage B browser export self-check, Stage B ingester, and required Stage B blocker fixtures.
- Task commits exist: `abcd521`, `9fefe2c`, `69f7135`, `66ca732`, `b7e76c4`, `bb6789c`.
- Targeted Stage B verification commands passed after blocker fixture recording.

---
*Phase: 02-nuvei-sandbox-evidence-and-checkout-validation*
*Completed: 2026-06-08*
