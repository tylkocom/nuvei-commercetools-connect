---
phase: 02-nuvei-sandbox-evidence-and-checkout-validation
plan: 02
subsystem: payments-evidence
tags: [nuvei, commercetools, evidence, mock-ct, stage-a, npm]

requires:
  - phase: 02-nuvei-sandbox-evidence-and-checkout-validation
    provides: Plan 02-01 evidence schema, raw workspace isolation, sanitizer, and validator
provides:
  - Processor-compatible local mock CT Session/OAuth/Cart/Payment ledger
  - Stage A processor/Nuvei capture runner with raw-workspace sanitization
  - Sanitized NUV-01 server-side session/openOrder-visible evidence and mock CT snapshots
  - Stage A field-matrix observations for Payment.interfaceId=sessionToken and clientUniqueId=cartId
affects: [phase-02-stage-b, phase-02-stage-c, phase-03-reconciliation-planning, nuvei-sandbox-evidence]

tech-stack:
  added: []
  patterns:
    - Package-local Node ESM evidence runners with no new dependencies
    - Explicit PHASE_02_STAGE_A_LOCAL_MOCK_CT gate for local HTTP mock CT URLs
    - Raw capture files written only under .planning/tmp/phase-02-raw/ before sanitization

key-files:
  created:
    - examples/nuvei-web-ui/scripts/mock-ct-self-check.mjs
    - examples/nuvei-web-ui/scripts/capture-stage-a.mjs
    - processor/test/unit/config.stage-a-local.test.ts
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/metadata.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/openOrder-response.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/processor-session-response.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/ct-cart-after-session.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/ct-payment-after-session.json
  modified:
    - examples/nuvei-web-ui/package.json
    - examples/nuvei-web-ui/mock-commercetools-server.mjs
    - examples/nuvei-web-ui/scripts/sanitize-evidence.mjs
    - examples/nuvei-web-ui/scripts/validate-evidence.mjs
    - processor/src/config/config.ts
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json
    - .planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/aliases/alias-map.json

key-decisions:
  - "Keep Stage A capture package-local in examples/nuvei-web-ui and add no dependencies."
  - "Allow local HTTP commercetools URLs only behind PHASE_02_STAGE_A_LOCAL_MOCK_CT=true and only for localhost/127.0.0.1 auth/api/session URLs."
  - "Record Stage A NUV-01 as server setup captured, not requirement-passed; browser authorization, getPaymentStatus, DMN, and real Checkout proof remain later-stage evidence."

patterns-established:
  - "Mock CT compatibility self-check verifies Session, Cart, Payment, OAuth token, and OAuth introspection shapes without starting the processor."
  - "Stage A runner refuses fake evidence: --require-real-nuvei fails on missing config unless --record-blocker writes exact blocker rows."
  - "Sanitizer aliases transaction interactionId values when they carry the Nuvei session token, preventing raw token leakage in CT Payment snapshots."

requirements-completed: []
requirements-addressed: [NUV-01, NUV-05, NUV-06]

duration: 16min
completed: 2026-06-08
---

# Phase 02 Plan 02: Stage A Processor/Nuvei Server-Side Capture Summary

**Local mock CT ledger plus real Nuvei openOrder session capture through the processor, sanitized into Stage A evidence fixtures without closing browser/DMN/Checkout gates**

## Performance

- **Duration:** 16 min
- **Started:** 2026-06-08T11:41:42Z
- **Completed:** 2026-06-08T11:57:00Z
- **Tasks:** 2 completed
- **Files modified:** 18 implementation/evidence files

## Accomplishments

- Extended `examples/nuvei-web-ui/mock-commercetools-server.mjs` into a local CT-compatible ledger for Stage A: `POST /oauth/token`, `POST /oauth/introspect`, session lookup, cart get/update, payment query/create/get/update, and existing browser-harness endpoints still intact.
- Added `npm --prefix examples/nuvei-web-ui run mock:ct:self-check`, proving active session metadata, CT-like cart/payment creation, cart `addPayment`, and OAuth responses without starting the processor.
- Added `npm --prefix examples/nuvei-web-ui run capture:stage-a`, which writes raw captures only under `.planning/tmp/phase-02-raw/`, sanitizes into `evidence/`, updates `index.json` and `field-matrix.json`, and records blocker rows instead of fake evidence when required Nuvei/config prerequisites are absent.
- Ran Stage A against a local processor pointed at mock CT with real Nuvei sandbox credentials available in the environment. Sanitized fixtures now exist for `NUV-01-success-auth`: `openOrder-response.json`, `processor-session-response.json`, `ct-cart-after-session.json`, and `ct-payment-after-session.json`.
- Updated `field-matrix.json` for Stage A: `Payment.interfaceId=sessionToken` is confirmed and `clientUniqueId=cartId` is confirmed; PPP terminal identity remains unresolved because browser authorization and DMN capture are explicitly later plans.
- Added a narrow processor config exception required for the local mock CT evidence mode: `PHASE_02_STAGE_A_LOCAL_MOCK_CT=true` allows only `http://localhost:*` / `http://127.0.0.1:*` for `CTP_AUTH_URL`, `CTP_API_URL`, and `CTP_SESSION_URL`. Default/production HTTPS validation is unchanged.

## Task Commits

1. **Task 1 RED: Add failing mock CT ledger self-check** — `8fc2934` (`test`)
2. **Task 1 GREEN: Extend mock CT ledger for processor Stage A** — `89d205d` (`feat`)
3. **Task 2 RED: Add failing Stage A capture runner** — `e6d795f` (`test`)
4. **Task 2 GREEN: Capture Stage A processor/Nuvei evidence** — `63a0350` (`feat`)

**Plan metadata:** recorded in final docs commit.

## Files Created/Modified

- `examples/nuvei-web-ui/package.json` — Added `mock:ct:self-check` and `capture:stage-a` package-local commands.
- `examples/nuvei-web-ui/mock-commercetools-server.mjs` — Added processor-compatible local CT Session/OAuth/Cart/Payment API layer while preserving existing harness routes.
- `examples/nuvei-web-ui/scripts/mock-ct-self-check.mjs` — Self-contained compatibility check for the local CT ledger.
- `examples/nuvei-web-ui/scripts/capture-stage-a.mjs` — Stage A capture/blocker runner.
- `examples/nuvei-web-ui/scripts/sanitize-evidence.mjs` — Improved aliasing for CT payment refs and `interactionId=sessionToken` evidence.
- `examples/nuvei-web-ui/scripts/validate-evidence.mjs` — Added `--stage stage-a` validation and interaction ID raw-leak checks.
- `processor/src/config/config.ts` — Added gated Stage A local mock CT HTTP exception.
- `processor/test/unit/config.stage-a-local.test.ts` — Verifies reject-by-default, allow-local-only with the flag, and reject-non-local HTTP even with the flag.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/*` — Sanitized Stage A NUV-01 server setup evidence fixtures and metadata.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` — Marks NUV-01 as `stage-a-server-captured` and keeps status `pending-capture` for later Stage B/C evidence.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json` — Records Stage A identity observations.
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/aliases/alias-map.json` — Stores hash-only alias metadata for captured cart/payment/session values.

## Decisions Made

- Kept Stage A automation in the existing example package with no new dependencies or root workspace changes.
- Used additive mock CT endpoints under `/payment-integration/*` and `/oauth/*`; existing browser harness endpoints remain available.
- Kept `NUV-01-success-auth.status` as `pending-capture` even after Stage A, because Stage A captures server setup only and does not prove browser authorization, `getPaymentStatus`, DMN, `NUV-07`, or `NUV-08`.
- Added the Stage A local HTTP exception in processor config only after the config blocker appeared; the exception is explicitly opt-in and localhost-only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added explicit local mock CT HTTP config gate**
- **Found during:** Task 2 (Stage A processor/Nuvei capture)
- **Issue:** Processor startup validation rejected `http://127.0.0.1:*` CT auth/api/session URLs, but Stage A requires the processor to point at local mock CT.
- **Fix:** Added `PHASE_02_STAGE_A_LOCAL_MOCK_CT=true` as an explicit evidence-mode exception for only `CTP_AUTH_URL`, `CTP_API_URL`, and `CTP_SESSION_URL`, limited to `localhost` / `127.0.0.1`.
- **Files modified:** `processor/src/config/config.ts`, `processor/test/unit/config.stage-a-local.test.ts`
- **Verification:** `npm --prefix processor test -- test/unit/config.stage-a-local.test.ts`
- **Committed in:** `63a0350`

**2. [Rule 1 - Bug] Tightened sanitizer/validator for CT Payment snapshots**
- **Found during:** Task 2 evidence review after Stage A capture
- **Issue:** Raw `interactionId` values can equal the Nuvei session token in CT initial Authorization snapshots; cart payment references also needed payment aliases, not cart aliases.
- **Fix:** Sanitizer now aliases `interactionId` using existing session/PPP/transaction aliases and treats cart `paymentInfo.payments[].id` as Payment IDs. Validator now rejects raw `interactionId` values.
- **Files modified:** `examples/nuvei-web-ui/scripts/sanitize-evidence.mjs`, `examples/nuvei-web-ui/scripts/validate-evidence.mjs`, evidence fixtures
- **Verification:** `npm --prefix examples/nuvei-web-ui run validate:evidence -- --stage stage-a`
- **Committed in:** `63a0350`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both were required to capture Stage A evidence safely. No broad hardening or later-stage flow work was added.

## Issues Encountered

- The processor response exposes `sessionToken`, amount, currency, cart ID, payment reference, and return URL, but not Nuvei `orderId` or `clientRequestId`. Stage A therefore records only openOrder-derived fields visible through the processor response; `orderId`, PPP, fiscal transaction ID, status, and DMN fields remain `unobserved` / `unresolved` for later plans rather than being faked.
- The first rerun attempted occupied ports left by an earlier verification shell. Subsequent verification used fresh local ports and direct `tsx` execution so process cleanup owned the running PIDs.

## Known Stubs

| File | Line | Reason |
| --- | --- | --- |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` | 60 | `NUV-01-success-auth` browser, getPaymentStatus, DMN, after-confirm, and after-DMN fixture slots remain `not-captured`; Plans 02-03 and 02-04 own those stages. |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json` | 42 | `NUV-01-success-auth` PPP/transaction/status fields remain `unobserved` because Stage A intentionally does not run browser authorization, confirm polling, or DMN capture. |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` | 502 | `NUV-05-*` operation rows remain pending; Stage A verified operation-route prerequisites through CT/OAuth mock support, while actual capture/cancel/refund evidence remains Stage C scope. |
| `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json` | 864 | `NUV-07` and `NUV-08` remain pending by design; local mock CT evidence cannot satisfy real commercetools Checkout gates. |

## Threat Flags

| Flag | File | Description |
| --- | --- | --- |
| `threat_flag: local-http-config-exception` | `processor/src/config/config.ts` | Adds a new opt-in local HTTP exception for CT URLs. Mitigated by requiring `PHASE_02_STAGE_A_LOCAL_MOCK_CT=true`, allowing only auth/api/session CT URLs, and limiting hosts to `localhost` / `127.0.0.1`. |

## TDD Gate Compliance

- Task 1 RED commit present: `8fc2934` (`test(02-02): add failing mock CT ledger self-check`), observed failing on missing `/payment-integration/sessions/session-local-001`.
- Task 1 GREEN commit present after RED: `89d205d` (`feat(02-02): extend mock CT ledger for processor stage A`).
- Task 2 RED commit present: `e6d795f` (`test(02-02): add failing stage A capture runner`), observed failing with `capture-stage-a not implemented`.
- Task 2 GREEN commit present after RED: `63a0350` (`feat(02-02): capture Stage A processor Nuvei evidence`).

## Verification

Passed targeted Plan 02-02 checks only:

```bash
npm --prefix examples/nuvei-web-ui run mock:ct:self-check
npm --prefix processor test -- test/unit/config.stage-a-local.test.ts
npm --prefix examples/nuvei-web-ui run capture:stage-a -- --scenario NUV-01-success-auth --require-real-nuvei
npm --prefix examples/nuvei-web-ui run validate:evidence -- --stage stage-a
```

Observed results:

- `mock CT self-check passed`
- `3 passed` in `processor/test/unit/config.stage-a-local.test.ts`
- `stage A capture complete for NUV-01-success-auth`
- `evidence validation passed`

## User Setup Required

None for this run — Nuvei sandbox server credentials were available in the execution environment. Future reruns still require:

- `PROCESSOR_URL` pointing at a locally started processor.
- `MOCK_CT_URL` pointing at `examples/nuvei-web-ui/mock-commercetools-server.mjs`.
- Processor started with `PHASE_02_STAGE_A_LOCAL_MOCK_CT=true` and `CTP_AUTH_URL`, `CTP_API_URL`, `CTP_SESSION_URL` pointed at `MOCK_CT_URL`.
- Nuvei sandbox env vars: `NUVEI_MERCHANT_ID`, `NUVEI_MERCHANT_SITE_ID`, `NUVEI_SECRET_KEY`, `NUVEI_API_BASE_URL`.

## Next Phase Readiness

- Plan 02-03 can reuse the mock CT ledger and Stage A NUV-01 server setup fixtures for dual-mode browser capture.
- Plan 02-04 still owns DMN tunnel, getPaymentStatus/status evidence, operations evidence, duplicate DMN, and mismatch rows.
- Plan 02-05 remains the only plan that can satisfy `NUV-07` and `NUV-08`; local mock CT evidence remains explicitly non-real-Checkout evidence.

## Self-Check: PASSED

- Created files exist: summary, mock CT self-check, Stage A capture runner, config gate test, and all NUV-01 Stage A evidence fixtures.
- Task commits exist: `8fc2934`, `89d205d`, `e6d795f`, `63a0350`.
- Working tree after self-check contained only this uncommitted summary before metadata/state updates.

---
*Phase: 02-nuvei-sandbox-evidence-and-checkout-validation*
*Completed: 2026-06-08*
