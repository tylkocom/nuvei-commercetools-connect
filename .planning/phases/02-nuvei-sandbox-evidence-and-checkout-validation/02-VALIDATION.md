# Phase 02 Validation: Nuvei Sandbox Evidence and Checkout Validation

**Created:** 2026-06-08
**Phase:** 02-nuvei-sandbox-evidence-and-checkout-validation
**Scope:** Validate that each plan produces reproducible, sanitized evidence and that local automation does not replace the real commercetools Checkout gate.

## Validation Contract

Phase 2 is valid only if:

1. raw capture storage is gitignored before any raw Nuvei/commercetools/browser material is written;
2. committed evidence is sanitized, schema-valid, and indexed;
3. local stages run in order: server-side, browser-side, combined DMN/tunnel;
4. local mock evidence is explicitly labeled and cannot satisfy `NUV-07` or `NUV-08`;
5. final Complete Checkout and Payment Only rows are backed by real commercetools Checkout evidence or exact blockers.

## Plan-to-Validation Map

| Plan | Primary validation | Feedback latency | Sampling continuity | Wave 0/script coverage |
| --- | --- | --- | --- | --- |
| `02-01-PLAN.md` | `npm --prefix examples/nuvei-web-ui run validate:evidence` validates empty manifests, schemas, aliases, forbidden patterns, fixture links, stage rules, and NUV-01..NUV-08 placeholder rows. | Fast: local script, no sandbox dependency. | Every later plan must rerun this validator after writing evidence. | Creates `.gitignore` raw rule, `sanitize-evidence.mjs`, `validate-evidence.mjs`, scenario catalog, schemas, and empty manifests. |
| `02-02-PLAN.md` | Stage A capture runner plus evidence validator prove processor session/openOrder evidence is sanitized and indexed against mock CT ledger shapes. | Medium: requires local processor/mock CT and Nuvei sandbox credentials. | Updates NUV-01/NUV-05/NUV-06 rows without completing browser/DMN/real CT gates. | Reuses Plan 01 sanitizer/validator; adds mock CT self-check and Stage A capture script. |
| `02-03-PLAN.md` | Browser capture export/ingest plus evidence validator prove Simply Connect and Web SDK local browser observations are labeled by mode and correlated to local processor evidence. | Medium/high: manual browser or semi-automated local browser flow plus Nuvei sandbox behavior. | Updates NUV-01..NUV-04 browser rows and field matrix; unresolved mode gaps become findings/blockers. | Reuses Plan 01 validator and Plan 02 mock processor/ledger setup. |
| `02-04-PLAN.md` | Combined DMN/tunnel capture, operation probes, duplicate/mismatch scenarios, and evidence validator prove NUV-05 and DMN field matrix evidence is captured or blocked precisely. | High: requires public HTTPS tunnel, Nuvei DMN configuration rights, and sandbox operation support. | Updates NUV-01..NUV-06 rows with DMN/status/operation evidence; synthetic mismatch rows must be labeled. | Reuses validator/sanitizer; raw checksum mutation remains local-only. |
| `02-05-PLAN.md` | Final evidence validator enforces `NUV-07` and `NUV-08` rows use real commercetools Checkout environment, not local mock, and include UI + CT ledger + Nuvei/DMN/processor proof or exact blockers. | High/manual: requires real commercetools Checkout setup. | Completes phase only when real CT smoke rows pass; otherwise records blockers and keeps phase incomplete. | Reuses all prior evidence tooling; no new framework. |

## Requirement Validation Matrix

| Requirement | Validation source | Pass condition |
| --- | --- | --- |
| `NUV-01` | Plans 02-02, 02-03, 02-04 | Successful authorization has sanitized openOrder/session, browser result, status/DMN, CT payment snapshots, and field matrix rows. |
| `NUV-02` | Plans 02-03, 02-04 | Declined authorization has sanitized browser/confirm/status/DMN evidence and safe failed outcome metadata. |
| `NUV-03` | Plans 02-03, 02-04 | 3DS frictionless approval has labeled frontend mode, sandbox card metadata, final status/DMN, and field matrix rows. |
| `NUV-04` | Plans 02-03, 02-04 | 3DS step-up success and failure/abandonment attempts have evidence or exact account/card/browser blockers. |
| `NUV-05` | Plans 02-02, 02-04 | Capture, cancel, refund, duplicate DMN, and mismatch scenarios have sanitized fixtures or account/config blockers with attempts. |
| `NUV-06` | Plans 02-01..02-05 | `field-matrix.json` maps CT Payment, interfaceId, cart, sessionToken, PPP variants, TransactionID variants, clientUniqueId, merchant_unique_id, amount, currency, and status per scenario. |
| `NUV-07` | Plan 02-05 | Complete Checkout success row is marked real commercetools Checkout and includes Checkout UI note, CT ledger snapshot, and Nuvei/processor evidence. |
| `NUV-08` | Plan 02-05 | Payment Only success row is marked real commercetools Checkout and includes Checkout UI note, CT ledger snapshot, and Nuvei/processor evidence. |

## Negative Validation Rules

The validator and execution summaries must reject or flag:

- raw session tokens, checksums, CT credentials, Nuvei credentials, PAN-adjacent card data, shopper PII, or unsanitized webhook bodies under `evidence/`;
- any `NUV-07` or `NUV-08` row whose environment is local mock instead of real commercetools Checkout;
- evidence rows without scenario ID, requirement IDs, stage, environment, frontend mode, fixture links, conclusion, and blocker/finding status;
- field matrix rows that omit core identity fields or fail to state `confirmed`, `contradicted`, `unresolved`, or `blocked` against the expected identity model;
- synthetic mismatch evidence that is not labeled `synthetic-derived-from-real-dmn`.

## Feedback Loop

1. Run the narrow capture command for the active plan/stage.
2. Sanitize raw output into `evidence/`.
3. Run `npm --prefix examples/nuvei-web-ui run validate:evidence`.
4. Fix only evidence-capture blockers in scope for the current plan.
5. Record non-blocking behavior defects in `evidence/findings.json` with target phase.
6. Commit sanitized evidence and plan summary only after validation passes.

## Completion Gate

Phase 2 is not complete until:

- all five plans have summaries;
- evidence validation passes for the full bundle;
- `NUV-01` through `NUV-06` are passed or blocked with exact sandbox/account attempts;
- `NUV-07` and `NUV-08` are passed with real commercetools Checkout evidence, not local mock evidence;
- any unresolved contradiction in canonical field identity is explicitly routed before Phase 3 planning.
