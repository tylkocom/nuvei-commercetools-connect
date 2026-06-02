# Phase 2: Nuvei Sandbox Evidence and Checkout Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 2-nuvei-sandbox-evidence-and-checkout-validation
**Areas discussed:** Evidence scope, Environment sequence, Evidence artifacts, Sanitization, Pass/fail gates, Bug handling, Fixture storage/naming, Checkout proof, Canonical conclusions, Operator proof, Raw captures

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Discuss all | Evidence scope, sandbox environment shape, sanitization rules, pass/fail gates, and artifact format. | ✓ |
| Evidence scope | Which flows are mandatory now vs deferred: success, decline, 3DS, operations, duplicates, mismatch. | |
| Environment shape | Whether to use real commercetools Checkout/Connect first, local tunnel/mock harness first, or both. | |
| Evidence artifacts | How sanitized payloads, screenshots/logs, and canonical-field conclusions should be stored for Phase 3. | |

**User's choice:** Discuss all.

---

## Evidence Scope

| Option | Description | Selected |
|--------|-------------|----------|
| All NUV requirements | Capture success, decline, 3DS frictionless, 3DS step-up success/failure/abandonment, capture/cancel/refund/duplicate/mismatch, Complete Checkout, and Payment Only. | ✓ after follow-up |
| Card auth first, ops later | Complete success/decline/3DS + Checkout modes now; capture/cancel/refund/duplicate/mismatch stay Phase 3/6. | initially |
| Approval only first | Only prove one successful Complete Checkout and Payment Only card authorization; everything else deferred. | |

**User's choice:** Initially chose card auth first. Assistant pointed out this would leave NUV-05 and Phase 2 success criteria unmet. User confirmed all NUV-01..NUV-08 evidence should stay in Phase 2, with operations/duplicates/mismatch as evidence capture only.

---

## Environment Sequence

| Option | Description | Selected |
|--------|-------------|----------|
| Local tunnel first, then real Checkout | Use local processor + mock CT + tunnel for fast Nuvei DMN visibility, then validate Complete Checkout and Payment Only in commercetools sandbox. | ✓ |
| Real Connect only | Deploy connector to commercetools Connect and run all evidence through real Checkout/Payment Only. More realistic, slower to debug. | |
| Local mock only | Use existing local harness and Nuvei sandbox, defer real Checkout modes. Faster, but fails NUV-07/NUV-08. | |

**User's choice:** Local tunnel first, then real Checkout.

---

## Evidence Artifact Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Fixture bundle + index | Sanitized JSON fixtures under a phase evidence folder, plus an index mapping scenario → files → canonical field observations. Best for Phase 3 tests. | ✓ |
| Narrative report only | One markdown report with screenshots/log excerpts. Easier to read, weaker for automated test planning. | |
| Both fixture bundle and report | Sanitized machine-readable fixtures plus a human report explaining conclusions and gaps. | |

**User's choice:** Fixture bundle + index.

---

## Sanitization Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Strict redaction with stable aliases | Replace secrets/tokens/checksums/PAN-adjacent data with deterministic placeholders like sessionToken-001, payment-001, ppp-001 so correlation remains visible. | ✓ |
| Drop sensitive fields entirely | Maximum safety, but makes correlation analysis weaker because some fields disappear. | |
| Raw private fixtures in gitignored folder | Best debugging fidelity, but not acceptable for committed planning docs or code fixtures. | |

**User's choice:** Strict redaction with stable aliases.

---

## Pass/Fail Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Missing required scenario evidence blocks | If a NUV-01..NUV-08 scenario cannot be captured, Phase 2 fails or records a blocker; no hand-wavy completion. | ✓ |
| Best-effort evidence with gaps | Capture what works; unresolved scenarios become Phase 3/ops notes. Faster, but weakens downstream confidence. | |
| Only canonical identity matters | Phase passes once PPP/session/cart/payment correlation is proven, even if some flows are missing. | |

**User's choice:** Missing required scenario evidence blocks.

---

## Bug Handling During Evidence Capture

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence first, fix only blockers | Fix only bugs that prevent evidence capture; defer reconciliation/security hardening to Phase 3+. | ✓ after follow-up |
| Fix every discovered bug immediately | Can balloon into Phase 3/5/7 work and obscure evidence capture. | initially |
| No fixes, evidence only | Pure observation, but one blocking bug could prevent completing NUV requirements. | |

**User's choice:** Initially chose fixing every discovered bug. Assistant identified this as scope creep into reconciliation/security/frontend phases. User confirmed fixing evidence-capture blockers only and recording all other bugs as fixture-backed findings.

---

## Fixture Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Phase-local evidence folder | `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/` with subfolders per scenario. Keeps planning evidence colocated. | ✓ |
| Repository test fixtures | `processor/test/fixtures/nuvei-sandbox/` so Phase 3 can directly import them. Higher risk of test code depending on provisional evidence. | |
| Both phase evidence and promoted test fixtures | Capture in phase evidence first; only promote curated stable fixtures to test folders later in Phase 3. | |

**User's choice:** Phase-local evidence folder.

---

## Fixture Naming

| Option | Description | Selected |
|--------|-------------|----------|
| Scenario-numbered names | `NUV-01-success-auth/openOrder-response.json`, `dmn-auth.json`, `ct-payment-after-dmn.json`. Directly maps to requirements. | ✓ |
| Timestamped captures | Preserves capture order, harder to compare across runs. | |
| Human flow names only | Readable but weaker requirements traceability. | |

**User's choice:** Scenario-numbered names.

---

## Checkout-Mode Proof

| Option | Description | Selected |
|--------|-------------|----------|
| Checkout UI + CT ledger + Nuvei dashboard | Need browser evidence, CT Cart/Payment/Order state, processor logs, and Nuvei dashboard/DMN evidence. | ✓ |
| CT ledger only | If Payment/Order are correct, UI screenshots/logs are optional. Less proof of actual Checkout flow. | |
| Nuvei dashboard only | Proves PSP auth, not commercetools Checkout integration. | |

**User's choice:** Checkout UI + CT ledger + Nuvei dashboard.

---

## Canonical Conclusion Format

| Option | Description | Selected |
|--------|-------------|----------|
| Field matrix per scenario | A table mapping CT Payment.id, interfaceId, cartId, sessionToken, PPP_TransactionID, TransactionID, clientUniqueId across every fixture. | ✓ |
| One global conclusion only | Shorter, but can hide scenario-specific field absence/differences. | |
| Per-fixture comments | Flexible but harder for planner to consume systematically. | |

**User's choice:** Field matrix per scenario.

---

## Operator Proof Requirements

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal human proof | For each scenario: one evidence-index row with fixture links and pass/fail conclusion. No screenshots required. | ✓ |
| Operational proof pack | Fixture links plus sanitized processor log excerpt, CT ledger snapshot, Nuvei dashboard/DMN delivery note, and Checkout UI note. | |
| Screenshots everywhere | Require browser and dashboard screenshots for every scenario. Strong audit trail but more manual overhead and redaction risk. | |

**User's choice:** Minimal human proof.

---

## Raw Capture Handling

| Option | Description | Selected |
|--------|-------------|----------|
| No raw files | Agents must sanitize as they capture; safest, but harder to debug complex DMNs. | |
| Gitignored raw workspace allowed | Agents may use `.planning/tmp/phase-02-raw/` or similar gitignored local files, but must never commit raw captures and must delete or leave clearly gitignored. | ✓ |
| Raw private evidence allowed in phase folder | Not recommended: high risk of accidentally committing sensitive data. | |

**User's choice:** Gitignored raw workspace allowed.

---

## Enabler Integration Modes

| Option | Description | Selected |
|--------|-------------|----------|
| Simply Connect only | Treat the current implementation as the only Phase 2 browser integration path. | |
| Web SDK only | Revert toward the originally planned Web SDK path and ignore Simply Connect evidence. | |
| Evaluate both modes | Treat Simply Connect as current/default, but explicitly research and capture evidence for Web SDK differences before future enabler planning. | ✓ |

**User's choice:** Evaluate both modes.
**Notes:** User identified a missing integration-planning dimension: Nuvei frontend component generation can use Simply Connect or Web SDK, and they behave differently. Current implementation has shifted toward Simply Connect while the original plan expected Web SDK. Long-term support for both is desired if evidence validates both paths.

---

## Claude's Discretion

- Exact evidence index JSON/Markdown schema.
- Exact local tunnel tool and raw workspace path, if gitignored.
- Whether to add small sanitization/index validation helper scripts.

## Deferred Ideas

- Full reconciliation hardening remains Phase 3.
- Frontend polling/resilience remains Phase 5.
- Operations/runbook/readiness documentation remains Phase 7 unless directly needed for safe evidence capture.
