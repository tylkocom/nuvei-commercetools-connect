---
phase: 02-nuvei-sandbox-evidence-and-checkout-validation
verified: 2026-06-08T12:48:49Z
status: blocked
score: "0/4 roadmap success criteria verified; 0/8 NUV requirements satisfied"
requirements_score: "0/8"
success_criteria_score: "0/4"
overrides_applied: 0
phase_gate:
  status: blocked-incomplete
  phase_complete: false
  source: ".planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json"
automated_checks:
  - command: "npm --prefix examples/nuvei-web-ui run evidence:self-check"
    status: passed
    observed: "evidence self-check passed"
  - command: "npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --strict"
    status: passed
    observed: "phase 2 gate validation passed (blocked rows remain incomplete)"
  - command: "npm --prefix examples/nuvei-web-ui run validate:evidence -- --forbid-raw-output"
    status: passed
    observed: "evidence validation passed"
  - command: "npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --require-real-checkout"
    status: blocked_expected
    observed: "NUV-07-complete-checkout-success and NUV-08-payment-only-success require real Checkout evidence but rows are blocked; command exited 1 as expected."
re_verification:
  previous_status: blocked
  previous_score: "0/4 roadmap success criteria verified; 0/8 NUV requirements satisfied"
  gaps_closed:
    - "Stale evidence:self-check failure resolved; the self-check now exits 0."
    - "NUV-05 mismatch syntheticLabel warning resolved; blocker fixtures now use not-synthetic-no-real-dmn-source."
  gaps_remaining:
    - "Real Complete Checkout and Payment Only proof is absent for NUV-07 and NUV-08."
    - "Real browser, status, and DMN evidence is absent for NUV-01 through NUV-04."
    - "Real capture, cancel, refund, duplicate DMN, and mismatch operation evidence is absent for NUV-05."
    - "Canonical Nuvei DMN-to-commercetools Payment field remains unproven for NUV-06."
  regressions: []
gaps:
  - truth: "User can complete a successful sandbox card authorization in Complete Checkout and Payment Only modes."
    status: blocked
    requirements: [NUV-07, NUV-08]
    reason: "No real commercetools Checkout raw proof exists for Complete Checkout or Payment Only; all required UI, CT ledger, processor, Nuvei dashboard, and DMN fixture slots are absent."
    artifacts:
      - path: ".planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json"
        issue: "phaseGate.status=blocked-incomplete; NUV-07 and NUV-08 rows status=blocked and evidenceSatisfiesRequirements=false."
      - path: ".planning/tmp/phase-02-raw/stage-d/"
        issue: "Directory not found during verification; no verified raw Stage D exports to ingest."
    missing:
      - "Real Complete Checkout raw exports under .planning/tmp/phase-02-raw/stage-d/NUV-07-complete-checkout-success/."
      - "Real Payment Only raw exports under .planning/tmp/phase-02-raw/stage-d/NUV-08-payment-only-success/."
      - "For each mode: Checkout UI evidence, CT Cart/Payment/Order or Payment ledger evidence, processor session/confirm evidence, Nuvei dashboard transaction, and DMN auth evidence."
  - truth: "User can exercise decline, 3DS frictionless, 3DS step-up success, and 3DS failure or abandonment flows with sanitized evidence captured."
    status: blocked
    requirements: [NUV-02, NUV-03, NUV-04]
    reason: "Stage B browser and Stage C DMN rows are blocker records, not observed browser/Nuvei evidence."
    artifacts:
      - path: ".planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json"
        issue: "NUV-02, NUV-03, and both NUV-04 scenario rows have status=blocked and evidenceClassification=stage-c-blocked."
      - path: ".planning/tmp/phase-02-raw/stage-b/"
        issue: "Directory not found during verification; no operator/browser raw exports are present."
    missing:
      - "Operator/browser raw exports for each scenario and frontend mode required by Stage B."
      - "Real Nuvei DMNs/status evidence for decline and 3DS flows through Stage C."
  - truth: "Operator can inspect sanitized sandbox payload evidence for capture, cancel authorization, refund, duplicate DMN, and mismatch cases."
    status: blocked
    requirements: [NUV-05]
    reason: "NUV-05 fixture files exist only as blocker records; no real operation, DMN, duplicate replay, or mismatch payload source material was captured."
    artifacts:
      - path: ".planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-05-capture/metadata.json"
        issue: "status=blocked; missing Nuvei dashboard permission/live browser payment/real DMN prerequisite."
      - path: ".planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-05-mismatch/metadata.json"
        issue: "Blocker fixture with syntheticLabel=not-synthetic-no-real-dmn-source; not real or synthetic-derived-from-real-DMN mismatch evidence."
    missing:
      - "Real capture, cancel, refund processor/Nuvei operation responses and related CT snapshots."
      - "Real duplicate DMN replay source and processor outcome."
      - "Mismatch evidence derived from a real raw DMN, or an exact accepted blocker."
  - truth: "Operator can identify the canonical Nuvei DMN field that maps each event to exactly one commercetools Payment."
    status: blocked
    requirements: [NUV-06]
    reason: "Field matrix identity assessments are blocked across scenarios; PPP_TransactionID, merchant_unique_id, fiscal TransactionID, and status fields remain unobserved for real DMN evidence."
    artifacts:
      - path: ".planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json"
        issue: "identityModelAssessment values are blocked for NUV-01..NUV-08; no canonical DMN correlation field is proven."
    missing:
      - "Real DMN payloads with merchant_unique_id, PPP_TransactionID variants, TransactionID variants, clientUniqueId, amount, currency, and final status mapped to CT Payment snapshots."
  - truth: "Successful sandbox card authorization is captured end-to-end."
    status: blocked
    requirements: [NUV-01]
    reason: "Stage A has sanitized server setup/openOrder-visible fields, but browser authorization, getPaymentStatus, DMN auth, and after-DMN CT proof are blocker records."
    artifacts:
      - path: ".planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/openOrder-response.json"
        issue: "Contains sanitized sessionToken/clientUniqueId/amount/currency only; does not prove authorization."
      - path: ".planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-01-success-auth/dmn-auth.json"
        issue: "Blocker metadata, not a real DMN auth payload."
    missing:
      - "Observed browser authorization result, processor confirm/getPaymentStatus response, real DMN auth payload, and CT Payment after-DMN snapshot."
process_notes:
  - "ROADMAP marks Phase 2 as mode=mvp, but the phase goal is an evidence/validation objective rather than a user-story goal. This refresh follows the assignment contract and verifies against the explicit roadmap success criteria and NUV-01..NUV-08 requirements."
  - "No overrides were present or applied."
  - "No project-wide gates were run."
---

# Phase 02 Verification Report: Nuvei Sandbox Evidence and Checkout Validation

**Phase goal:** Real Nuvei sandbox and commercetools Checkout card behavior is observed, sanitized, and sufficient to choose canonical correlation fields.

**Status:** blocked

**Verdict:** Phase 2 is still not complete. The stale evidence self-check failure is resolved and the NUV-05 mismatch synthetic-label warning is resolved, but real browser, DMN, operation, and commercetools Checkout proof is still absent. No `NUV-*` requirement is marked passed.

## Refresh Scope

This refresh updates the previous verification after evidence tooling fixes. It deliberately keeps the phase blocked because the codebase still contains blocker records rather than real sandbox/Checkout evidence for the load-bearing Phase 2 requirements.

Files read for this refresh:

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/02-CONTEXT.md`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/02-VALIDATION.md`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/02-01-SUMMARY.md`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/02-02-SUMMARY.md`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/02-03-SUMMARY.md`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/02-04-SUMMARY.md`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/02-05-SUMMARY.md`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/index.json`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/findings.json`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/field-matrix.json`
- `examples/nuvei-web-ui/scripts/validate-evidence.mjs`
- `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/NUV-05-mismatch/metadata.json`
- Existing `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/02-VERIFICATION.md`
- Representative NUV-05 mismatch blocker fixture files and raw-workspace directories needed to verify the fixed warning and remaining blockers.

## Re-verification Result

| Previous item | Current result | Evidence |
|---|---|---|
| `evidence:self-check` failed with a stale real-checkout assertion. | RESOLVED | `npm --prefix examples/nuvei-web-ui run evidence:self-check` exited 0 and printed `evidence self-check passed`. `validate-evidence.mjs` now asserts current wording: `real commercetools Checkout environment`. |
| NUV-05 mismatch blocker used an ambiguous `synthetic-derived-from-real-dmn` label despite no real raw DMN. | RESOLVED | `NUV-05-mismatch/metadata.json`, `dmn-mismatch-request.json`, `processor-mismatch-response.json`, and `ct-payment-after-mismatch.json` all use `syntheticLabel: not-synthetic-no-real-dmn-source`. The index row remains `status=blocked`, `synthetic=false`. |
| Phase 2 lacked real Checkout proof. | STILL BLOCKED | `.planning/tmp/phase-02-raw/stage-d/` is absent; `validate:phase-2-gate -- --require-real-checkout` exits 1 for blocked `NUV-07` and `NUV-08`. |
| Phase 2 lacked real browser/DMN/operation payloads. | STILL BLOCKED | `.planning/tmp/phase-02-raw/stage-b/` is absent; Stage C raw DMN contains only self-check material; NUV-01..NUV-05 scenario rows remain blocker records. |

## Roadmap Success Criteria

| # | Success criterion | Verdict | Codebase evidence |
|---|---|---|---|
| 1 | User can complete successful sandbox card authorization in Complete Checkout and Payment Only modes. | BLOCKED | `evidence/index.json.phaseGate.status=blocked-incomplete`; `NUV-07` and `NUV-08` rows are `status=blocked`; `.planning/tmp/phase-02-raw/stage-d/` is absent. |
| 2 | User can exercise decline, 3DS frictionless, 3DS step-up success, and 3DS failure/abandonment flows with sanitized evidence. | BLOCKED | `NUV-02`, `NUV-03`, and both `NUV-04` rows are `stage-c-blocked`; `.planning/tmp/phase-02-raw/stage-b/` is absent; no real DMN exists under Stage C raw capture. |
| 3 | Operator can inspect sanitized sandbox payload evidence for capture, cancel authorization, refund, duplicate DMN, and mismatch cases. | BLOCKED | `NUV-05-*` rows are `stage-c-blocked`; fixtures are blocker metadata, not real operation/DMN payloads. NUV-05 mismatch is now clearly labeled `not-synthetic-no-real-dmn-source`. |
| 4 | Operator can identify canonical Nuvei DMN field mapping events to exactly one CT Payment. | BLOCKED | `field-matrix.json` keeps identity assessments `blocked`; PPP, fiscal `TransactionID`, `merchant_unique_id`, and final status are unobserved for real DMNs. |

**Success criteria score:** 0/4 verified.

## Requirement-by-Requirement Verdicts

| Requirement | Verdict | Evidence | Missing to pass |
|---|---|---|---|
| `NUV-01` Successful card authorization payloads | BLOCKED, partial Stage A setup only | `NUV-01/openOrder-response.json` and `processor-session-response.json` contain sanitized server setup aliases. `index.json` still marks later browser/status/DMN proof blocked. | Real browser auth result, processor confirm/status evidence, real DMN auth payload, CT Payment after-DMN snapshot. |
| `NUV-02` Declined card authorization payloads | BLOCKED | `NUV-02-decline-auth` row is `status=blocked`, `evidenceClassification=stage-c-blocked`. | Real decline browser/status/DMN evidence and CT failed outcome snapshot. |
| `NUV-03` 3DS frictionless approval payloads | BLOCKED | `NUV-03-3ds-frictionless` row is `status=blocked`; matrix fields are unobserved/blocked. | Real 3DS frictionless browser, Nuvei status/DMN, and CT snapshot evidence. |
| `NUV-04` 3DS step-up approval/failure/abandonment payloads | BLOCKED | Both `NUV-04` scenario rows are `status=blocked`; Web SDK and Simply Connect live browser/DMN evidence unavailable. | Real step-up success and failure/abandonment evidence, or exact accepted account/card/browser blockers. Current blockers are exact but do not satisfy the requirement. |
| `NUV-05` Capture/cancel/refund/duplicate/mismatch payloads | BLOCKED | All five `NUV-05-*` rows are `status=blocked`; fixture files exist as blocker records. Mismatch blocker labels now state `not-synthetic-no-real-dmn-source`. | Real operation responses, related DMNs, duplicate replay outcome, and mismatch derived from real raw DMN material. |
| `NUV-06` Canonical DMN field identifying one CT Payment | BLOCKED | `field-matrix.json` lists identity model assessments as `blocked`; Stage A setup does not prove terminal DMN identity. | Real DMNs and CT snapshots proving or contradicting `merchant_unique_id`, `sessionToken/interfaceId`, `PPP_TransactionID`, `TransactionID`, `clientUniqueId`, amount/currency/status mapping. |
| `NUV-07` Complete Checkout succeeds in commercetools sandbox | BLOCKED | `NUV-07` row requires `commercetools-sandbox-complete-checkout`; all proof fixtures except `metadata.json` are `present:false`; Stage D raw directory absent. | Real Complete Checkout UI + CT Cart/Payment/Order + processor + Nuvei dashboard + DMN proof. |
| `NUV-08` Payment Only succeeds in commercetools sandbox | BLOCKED | `NUV-08` row requires `commercetools-sandbox-payment-only`; all proof fixtures except `metadata.json` are `present:false`; Stage D raw directory absent. | Real Payment Only UI + CT Cart/Payment + processor + Nuvei dashboard + DMN proof. |

**Requirement score:** 0/8 satisfied.

## Evidence Automation and Integrity

| Check | Verdict | Evidence |
|---|---|---|
| Evidence self-check is current | VERIFIED | `npm --prefix examples/nuvei-web-ui run evidence:self-check` -> `evidence self-check passed`. |
| Strict blocked-incomplete phase gate | VERIFIED | `npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --strict` -> `phase 2 gate validation passed (blocked rows remain incomplete)`. |
| Sanitization / forbidden raw output gate | VERIFIED | `npm --prefix examples/nuvei-web-ui run validate:evidence -- --forbid-raw-output` -> `evidence validation passed`. |
| Real Checkout required gate still blocks | VERIFIED | `npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --require-real-checkout` exited 1 with `NUV-07-complete-checkout-success: real Checkout evidence required but row is blocked` and the same for `NUV-08-payment-only-success`. |
| Real Checkout pass cannot come from mock/local evidence | VERIFIED | Stage D rows require `commercetools-sandbox-complete-checkout` / `commercetools-sandbox-payment-only`, proof classes `ui`, `ctLedger`, `processor`, `nuveiDmn`, and fixture files; current proof slots are absent and rows stay blocked. |
| NUV-05 mismatch label no longer ambiguous | VERIFIED | Mismatch blocker fixtures use `syntheticLabel=not-synthetic-no-real-dmn-source`; index row remains `synthetic=false`, `status=blocked`. |

No project-wide build/test/lint/format gates were run.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Evidence tooling self-check accepts current validator semantics | `npm --prefix examples/nuvei-web-ui run evidence:self-check` | Exit 0; `evidence self-check passed` | PASS |
| Blocked-incomplete Phase 2 strict gate remains accepted | `npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --strict` | Exit 0; `phase 2 gate validation passed (blocked rows remain incomplete)` | PASS |
| Committed evidence contains no forbidden raw output | `npm --prefix examples/nuvei-web-ui run validate:evidence -- --forbid-raw-output` | Exit 0; `evidence validation passed` | PASS |
| Real Checkout gate refuses blocked rows | `npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --require-real-checkout` | Exit 1; NUV-07 and NUV-08 require real Checkout evidence but rows are blocked | PASS as expected blocker |

## Blockers

### B1 — Real commercetools Checkout proof absent (`NUV-07`, `NUV-08`)

`evidence/index.json` records both Stage D rows as blocked. Required fixture slots are absent:

- `NUV-07`: `checkout-ui-evidence.json`, `ct-cart-after-checkout.json`, `ct-payment-after-checkout.json`, `ct-order-after-checkout.json`, `processor-session-response.json`, `processor-confirm-response.json`, `nuvei-dashboard-transaction.json`, `dmn-auth.json`
- `NUV-08`: `checkout-ui-evidence.json`, `ct-cart-after-payment-only.json`, `ct-payment-after-payment-only.json`, `processor-session-response.json`, `processor-confirm-response.json`, `nuvei-dashboard-transaction.json`, `dmn-auth.json`

`.planning/tmp/phase-02-raw/stage-d/` is absent. `validate:phase-2-gate -- --require-real-checkout` correctly fails with both rows blocked.

### B2 — Local browser/DMN evidence absent for `NUV-01`..`NUV-04`

`NUV-01` has Stage A server setup evidence only. `NUV-02`, `NUV-03`, and `NUV-04` are blocker records because no interactive browser export or real DMN was available. `.planning/tmp/phase-02-raw/stage-b/` is absent; Stage C raw DMN contains only self-check material.

### B3 — Operation, duplicate, and mismatch evidence absent for `NUV-05`

`NUV-05-capture`, `NUV-05-cancel-authorization`, `NUV-05-refund`, `NUV-05-duplicate-dmn`, and `NUV-05-mismatch` fixtures are blocker metadata. No real Nuvei operation response, DMN, duplicate replay, or mismatch source material is present. The prior mismatch warning is resolved: mismatch files are now explicitly `not-synthetic-no-real-dmn-source`.

### B4 — Canonical DMN identity not established (`NUV-06`)

`field-matrix.json` cannot choose the canonical DMN-to-CT-Payment field. It records blocked/unobserved values for real DMN identifiers and status fields. Phase 3 must not rely on a canonical field conclusion from this phase.

## Resolved Items From Previous Verification

1. **Evidence self-check stale assertion** — resolved. The command now passes and the validator self-check targets the current real Checkout environment wording.
2. **NUV-05 mismatch synthetic label ambiguity** — resolved. Mismatch blocker files now say `not-synthetic-no-real-dmn-source`; the row remains blocked and does not claim real or derived synthetic evidence.

## Warnings

None from the refreshed issues. The remaining items are blockers, not warnings: real evidence is missing.

## Next Concrete Action

Do not proceed as if Phase 2 is complete. Close the blockers in this order:

1. Re-run Stage B with operator/browser access and save raw exports under `.planning/tmp/phase-02-raw/stage-b/<scenario>/<frontendMode>/`, then run `capture:stage-b` for `NUV-01`, `NUV-02`, `NUV-03`, and both `NUV-04` rows.
2. Configure Nuvei sandbox DMN delivery to the tunnel, capture real DMNs/operations under `.planning/tmp/phase-02-raw/stage-c/dmn/`, and rerun `capture:stage-c -- --require-real-dmn` plus Stage C validation.
3. Capture real Complete Checkout and Payment Only proof under:
   - `.planning/tmp/phase-02-raw/stage-d/NUV-07-complete-checkout-success/`
   - `.planning/tmp/phase-02-raw/stage-d/NUV-08-payment-only-success/`
4. Run `npm --prefix examples/nuvei-web-ui run capture:real-checkout`, then `npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --require-real-checkout`.

Phase 2 can be marked passed only after the final real-checkout gate exits 0 and NUV rows are backed by real, sanitized proof rather than blocker records.

---

_Verified: 2026-06-08T12:48:49Z_
_Verifier: Claude (gsd-verifier)_
