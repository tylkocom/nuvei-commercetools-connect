---
phase: 01
slug: contract-and-method-hardening
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-02
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `processor/vitest.config.ts`, `enabler/vitest.config.ts` |
| **Quick run command** | `npm test -- --run <changed-test-file>` from the affected package directory |
| **Full suite command** | `npm test` from both `processor/` and `enabler/` when both contracts are touched |
| **Estimated runtime** | Package-local unit tests only |

---

## Sampling Rate

- **After every task commit:** Run the package-local changed test file or focused unit test covering the changed contract.
- **After every plan wave:** Run affected package test suites; run both package suites after parity tests or cross-package contract changes.
- **Before `/gsd-verify-work`:** Processor and enabler test suites must be green for all Phase 1 touched packages.
- **Max feedback latency:** Keep feedback focused on unit/contract tests; no sandbox E2E belongs in Phase 1.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | CONT-01 | T-01-CONFIG | Invalid enabler config fails before SDK load or processor call with structured safe error | unit | `cd enabler && npm test -- --run <enabler contract test>` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | CONT-03, CONT-04 | T-01-METHOD | Processor/enabler mirrored registries and advertised methods stay aligned | unit/contract | `cd processor && npm test -- --run <contract parity test>` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 2 | CONT-02, CONT-05 | T-01-SIDE-EFFECT | Unsupported/malformed requests do not call Nuvei openOrder or CT Payment creation | unit/route | `cd processor && npm test -- --run <payment service/route test>` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 2 | CONT-02, CONT-05 | T-01-ERROR | Public response exposes code/message only; logs retain redacted diagnostics | unit/route | `cd processor && npm test -- --run <error contract test>` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Add or update enabler unit tests for structured config errors and unsupported builders.
- [ ] Add processor contract parity tests proving `/payment-components`, processor supported methods, and enabler builder support agree for exposed methods.
- [ ] Add processor service/route tests proving unsupported and malformed requests do not call Nuvei `openOrder` or CT Payment creation.
- [ ] Add processor route/error tests for structured safe public errors.

---

## Manual-Only Verifications

All Phase 1 behaviors should have automated verification. No manual-only verification is expected.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency bounded to package-local unit/contract tests
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-02
