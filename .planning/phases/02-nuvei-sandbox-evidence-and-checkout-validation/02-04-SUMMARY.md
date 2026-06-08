---
phase: 02-nuvei-sandbox-evidence-and-checkout-validation
plan: 04
subsystem: payments-evidence
tags: [nuvei, dmn, tunnel, operations, duplicate, mismatch, stage-c, npm]

requires:
  - phase: 02-nuvei-sandbox-evidence-and-checkout-validation
    provides: Plan 02-01 evidence schema/sanitizer/validator, Plan 02-02 Stage A processor setup evidence, and Plan 02-03 Stage B browser blocker/capture contract
provides:
  - Safe Stage C DMN observer proxy that records raw webhooks under the gitignored raw workspace and forwards to processor /webhooks/nuvei
  - Tunnel dry-run and ngrok path that uses an installed binary/configured NGROK_BIN and never invokes unpinned npx
  - Stage C capture runner with real-DMN gate, exact blocker recording, duplicate/mismatch source policy, and Stage C validator enforcement
  - Sanitized blocker fixtures for NUV-01 through NUV-04 DMN rows and NUV-05 capture/cancel/refund/duplicate/mismatch rows
  - Field-matrix and findings updates that block canonical DMN conclusions until real Nuvei DMNs are captured
affects: [phase-02-stage-d, phase-03-reconciliation-planning, nuvei-dmn-evidence, operation-evidence]

tech-stack:
  added: []
  patterns:
    - Package-local Node ESM evidence tooling with no new dependencies
    - Raw DMN material written only under .planning/tmp/phase-02-raw/stage-c/ before sanitization
    - Stage C blocker rows are first-class evidence when dashboard/browser/DMN prerequisites are unavailable

key-files:
  created:
    - examples/nuvei-web-ui/scripts/capture-dmn-proxy.mjs
    - examples/nuvei-web-ui/scripts/capture-stage-c.mjs
    - examples/nuvei-web-ui/scripts/stage-c-dmn-tunnel-self-check.mjs
    - examples/nuvei-web-ui/scripts/stage-c-capture-self-check.mjs
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-05-capture/metadata.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-05-cancel-authorization/metadata.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-05-refund/metadata.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-05-duplicate-dmn/metadata.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-05-mismatch/metadata.json
  modified:
    - examples/nuvei-web-ui/package.json
    - examples/nuvei-web-ui/start-dmn-tunnel.mjs
    - examples/nuvei-web-ui/scripts/validate-evidence.mjs
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/findings.json

key-decisions:
  - "Keep Stage C evidence tooling package-local in examples/nuvei-web-ui with no new dependencies."
  - "Use installed ngrok or NGROK_BIN for tunnel startup; localtunnel is allowed only when already installed, and npx/runtime package downloads are refused."
  - "Record exact Stage C blocker fixtures instead of fake DMN, operation, duplicate, or mismatch evidence when Nuvei dashboard/browser/DMN access is unavailable."
  - "Synthetic mismatch evidence remains blocked unless derived from real raw DMN material and labeled synthetic-derived-from-real-dmn."

patterns-established:
  - "DMN observer proxy stores raw request metadata/body and processor response under .planning/tmp/phase-02-raw/stage-c/dmn/, then returns the processor status/body to Nuvei."
  - "Stage C validator requires requested scenarios to have Stage C evidence or exact Stage C blocker metadata."
  - "Operation, duplicate, and mismatch rows use blocker fixtures with attempted commands, dashboard path, expected raw DMN directory, and no-fake-evidence policy when real Nuvei material is absent."

requirements-completed: []
requirements-addressed: [NUV-01, NUV-02, NUV-03, NUV-04, NUV-05, NUV-06]

duration: 8min
completed: 2026-06-08
---

# Phase 02 Plan 04: Stage C DMN Tunnel, Operations, Duplicate, and Mismatch Evidence Summary

**Reproducible Stage C DMN/tunnel/operation capture tooling with validated blocker fixtures instead of fake Nuvei DMN or operation evidence**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-08T12:13:06Z
- **Completed:** 2026-06-08T12:20:25Z
- **Tasks:** 3 completed
- **Files modified:** 51 implementation/evidence files

## Accomplishments

- Added `capture:dmn-proxy`, a Node built-in DMN observer that writes raw request metadata/body and processor response material under `.planning/tmp/phase-02-raw/stage-c/dmn/`, forwards to `{PROCESSOR_URL}/webhooks/nuvei`, and returns the processor status/body.
- Reworked `tunnel:dmn` so Stage C dry-run prints the dashboard URL shape, observer URL, and processor target; `TUNNEL_PROVIDER=ngrok` uses `ngrok`/`NGROK_BIN` directly and never invokes `npx`.
- Added `capture:stage-c`, which can ingest real raw DMNs when present, fails `--require-real-dmn` if none exist, records exact blocker fixtures, and keeps mismatch evidence blocked unless a real raw DMN source exists for `synthetic-derived-from-real-dmn` material.
- Extended `validate:evidence -- --stage stage-c --require-scenarios ...` to require Stage C evidence or exact Stage C blocker metadata.
- Recorded sanitized blocker fixtures for `NUV-01` through `NUV-04` DMN rows and `NUV-05` capture, cancel authorization, refund, duplicate DMN, and mismatch rows because no Nuvei dashboard/browser/DMN access or real raw DMN delivery was available in this executor environment.
- Updated `field-matrix.json` so merchant_unique_id, sessionToken/interfaceId, PPP variants, fiscal TransactionID variants, and clientUniqueId assessments remain `blocked` rather than inferred.

## Task Commits

1. **Task 1 RED: Add failing Stage C tunnel self-check** — `850a3d9` (`test`)
2. **Task 1 GREEN: Add safe Stage C DMN tunnel tooling** — `45cd075` (`feat`)
3. **Task 3 RED: Add failing Stage C capture self-check** — `d881809` (`test`)
4. **Task 3 GREEN: Record Stage C capture blockers** — `5271a88` (`feat`)

**Plan metadata:** recorded in final docs commit.

## Files Created/Modified

- `examples/nuvei-web-ui/package.json` — Added `capture:dmn-proxy` and `capture:stage-c` package-local commands.
- `examples/nuvei-web-ui/start-dmn-tunnel.mjs` — Added dry-run output, installed-ngrok/`NGROK_BIN` execution, localtunnel-installed-only handling, and removed unpinned `npx` usage.
- `examples/nuvei-web-ui/scripts/capture-dmn-proxy.mjs` — Captures raw DMN requests/responses in the ignored raw workspace and forwards them to the processor webhook.
- `examples/nuvei-web-ui/scripts/capture-stage-c.mjs` — Records real-DMN-gated Stage C captures or exact blocker fixtures for DMN, operations, duplicate, and mismatch rows.
- `examples/nuvei-web-ui/scripts/validate-evidence.mjs` — Adds Stage C required-scenario enforcement.
- `examples/nuvei-web-ui/scripts/stage-c-dmn-tunnel-self-check.mjs` and `stage-c-capture-self-check.mjs` — TDD self-checks for tunnel/proxy and Stage C capture behavior.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` — Marks Stage C scenarios blocked with exact blocker metadata.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json` — Records Stage C blocked identity assessments.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/findings.json` — Adds Stage C blocker findings for downstream planning.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/*` through `NUV-05-mismatch/*` — Adds sanitized Stage C blocker fixtures for DMN/operation/duplicate/mismatch slots.

## Decisions Made

- Kept Stage C scripts in `examples/nuvei-web-ui` and added no dependencies.
- Chose blocker fixtures over real capture because the required Nuvei dashboard/control panel access, browser operation path, and raw DMN delivery were unavailable to this executor.
- Kept `NUV-05-mismatch` blocked rather than synthetic because no real raw DMN existed to derive a labeled `synthetic-derived-from-real-dmn` mismatch.
- Did not run or claim real commercetools Checkout evidence; `NUV-07` and `NUV-08` remain Plan 02-05 scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added Stage C required-scenario validator enforcement**
- **Found during:** Task 3 (Stage C capture/blocker recording)
- **Issue:** `validate:evidence -- --stage stage-c --require-scenarios ...` accepted the stage flag but did not enforce that required Stage C rows had real evidence or exact blocker metadata.
- **Fix:** Added Stage C required-scenario checks that require `stage-c-*` evidence classification or a Stage C blocker, and require `nuvei-sandbox-local-mock-ct` environment.
- **Files modified:** `examples/nuvei-web-ui/scripts/validate-evidence.mjs`
- **Verification:** `npm --prefix examples/nuvei-web-ui run validate:evidence -- --stage stage-c --require-scenarios NUV-01-success-auth,NUV-05-capture,NUV-05-cancel-authorization,NUV-05-refund,NUV-05-duplicate-dmn,NUV-05-mismatch`
- **Committed in:** `5271a88`

---

**Total deviations:** 1 auto-fixed (missing critical validation)
**Impact on plan:** Required to make Stage C blocker/evidence capture reproducible and validator-backed. No Phase 3 reconciliation hardening, Phase 5 frontend hardening, or Phase 7 docs cleanup was added.

## Issues Encountered

- `capture:stage-c -- --require-real-dmn` correctly failed because no real raw DMN existed under `.planning/tmp/phase-02-raw/stage-c/dmn`; the blocker runner recorded exact Stage C blocker fixtures instead.
- Nuvei dashboard/control panel access and live browser operation access were unavailable to this executor, so the plan did not capture real DMNs, operation responses, duplicate replay responses, or mismatch responses. The committed evidence explicitly says these are blocked and not faked.

## Known Stubs

| File | Line | Reason |
| --- | --- | --- |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` | `NUV-01`..`NUV-04` rows | Stage C DMN rows are `blocked` because no real Nuvei DMN reached the raw workspace. |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` | `NUV-05-*` rows | Capture/cancel/refund/duplicate/mismatch evidence is `blocked`; no real operation/DMN source material was available. |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json` | `NUV-01`..`NUV-05` rows | Identity assessments remain `blocked`; no canonical DMN field conclusion is made from unavailable evidence. |

## Threat Flags

| Flag | File | Description |
| --- | --- | --- |
| `threat_flag: dmn-observer-proxy` | `examples/nuvei-web-ui/scripts/capture-dmn-proxy.mjs` | Adds local public-webhook observer surface. Mitigated by raw workspace containment, no committed raw bodies, forwarding only to configured processor `/webhooks/nuvei`, and evidence validation before commit. |
| `threat_flag: tunnel-startup` | `examples/nuvei-web-ui/start-dmn-tunnel.mjs` | Starts external tunnel process. Mitigated by installed binary/`NGROK_BIN` only, dry-run verification, and no `npx`/runtime package downloads. |

## TDD Gate Compliance

- Task 1 RED commit present: `850a3d9` (`test(02-04): add failing Stage C tunnel self-check`), observed failing on missing `capture:dmn-proxy` script before implementation.
- Task 1 GREEN commit present after RED: `45cd075` (`feat(02-04): add safe Stage C DMN tunnel tooling`).
- Task 3 RED commit present: `d881809` (`test(02-04): add failing Stage C capture self-check`), observed failing on missing `capture-stage-c.mjs` before implementation.
- Task 3 GREEN commit present after RED: `5271a88` (`feat(02-04): record Stage C capture blockers`).

## Verification

Passed targeted Plan 02-04 checks only:

```bash
node examples/nuvei-web-ui/scripts/stage-c-dmn-tunnel-self-check.mjs
npm --prefix examples/nuvei-web-ui run capture:dmn-proxy -- --self-check
node examples/nuvei-web-ui/scripts/stage-c-capture-self-check.mjs
npm --prefix examples/nuvei-web-ui run capture:stage-c -- --self-check
npm --prefix examples/nuvei-web-ui run tunnel:dmn -- --dry-run
npm --prefix examples/nuvei-web-ui run capture:stage-c -- --require-real-dmn  # expected blocker-path failure without raw real DMN
npm --prefix examples/nuvei-web-ui run validate:evidence -- --stage stage-c --require-scenarios NUV-01-success-auth,NUV-05-capture,NUV-05-cancel-authorization,NUV-05-refund,NUV-05-duplicate-dmn,NUV-05-mismatch
```

Observed results:

- `stage C DMN tunnel self-check passed`
- `stage C DMN proxy self-check passed`
- `stage C capture self-check passed`
- Tunnel dry-run printed `Dashboard DMN URL shape: https://<ngrok-public-host>/webhooks/nuvei` plus local observer and processor webhook mapping.
- `capture:stage-c -- --require-real-dmn` failed with `no real raw DMN exists under .planning/tmp/phase-02-raw/stage-c/dmn`; this was the expected blocker path.
- `evidence validation passed`

## User Setup Required

To replace blocker fixtures with real Stage C evidence:

1. Start the processor pointed at mock CT with the same Stage A local mock settings and real Nuvei sandbox server credentials.
2. Start the DMN observer: `npm --prefix examples/nuvei-web-ui run capture:dmn-proxy`.
3. Start the tunnel: `TUNNEL_PROVIDER=ngrok npm --prefix examples/nuvei-web-ui run tunnel:dmn`.
4. Configure the Nuvei sandbox dashboard/control panel DMN URL to the printed HTTPS URL ending in `/webhooks/nuvei`.
5. Execute real browser sandbox scenarios and operations so raw DMNs arrive under `.planning/tmp/phase-02-raw/stage-c/dmn/`.
6. Rerun `npm --prefix examples/nuvei-web-ui run capture:stage-c -- --require-real-dmn` and Stage C validation.

## Next Phase Readiness

- Plan 02-05 can proceed to real commercetools Checkout smoke gates with Stage C tooling available and blocker rows explicitly recorded.
- Phase 3 planning must not rely on Stage C canonical field conclusions yet; all Stage C DMN/operation identity assessments are blocked until real Nuvei DMN material is captured.
- `NUV-05` remains addressed but not completed; capture/cancel/refund/duplicate/mismatch evidence is blocked by missing Nuvei dashboard/browser/DMN prerequisites.

## Self-Check: PASSED

- Created files exist: summary, DMN proxy, Stage C capture runner, Stage C self-checks, and Stage C blocker fixtures for required DMN/operation/duplicate/mismatch rows.
- Task commits exist: `850a3d9`, `45cd075`, `d881809`, `5271a88`.
- Targeted Stage C verification commands passed after blocker fixture recording; the real-DMN gate failed only on the expected missing-raw-DMN blocker path.
- Working tree after verification contained only this uncommitted summary before metadata/state updates.

---
*Phase: 02-nuvei-sandbox-evidence-and-checkout-validation*
*Completed: 2026-06-08*
