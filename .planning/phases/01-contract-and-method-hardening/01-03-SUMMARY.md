---
phase: 01-contract-and-method-hardening
plan: 03
subsystem: payments
tags: [processor, enabler, contract-parity, vitest, payment-methods]
requires:
  - 01-01
  - 01-02
provides:
  - Cross-package processor/enabler payment method registry parity tests
  - Registry-derived /payment-components advertisement assertions
  - Enabler builder support assertions for advertised card and embedded methods
  - Unsupported-method no-side-effect regression coverage for parity examples
affects: [phase-01-contract-and-method-hardening, processor, enabler, checkout-contract]
tech-stack:
  added: []
  patterns:
    - Processor contract tests import actual enabler and processor registry exports
    - /payment-components route expectations derive from processor registry entries
    - Unsupported method regressions assert no Nuvei openOrder or CT Payment creation side effects
key-files:
  created:
    - processor/test/unit/contract/payment-method-contract.test.ts
  modified:
    - processor/test/unit/routes/operation.route.test.ts
    - processor/test/unit/services/nuvei-payment.service.test.ts
    - enabler/test/unit/payment-enabler.test.ts
key-decisions:
  - "Contract parity is enforced by tests comparing the mirrored registry exports rather than copying method literals as a second source of truth."
  - "Embedded remains advertised and buildable as a transitional drop-in, with empty PSP metadata until sandbox evidence exists."
patterns-established:
  - "Registry public contract comparisons include key, kind, advertisedType, displayName, transitional flag, and PSP metadata."
  - "Unsupported examples from parity coverage are also no-side-effect service regressions."
requirements-completed: [CONT-03, CONT-04, CONT-05]
duration: 5min
completed: 2026-06-02
---

# Phase 1 Plan 3: Cross-Package Contract Parity Summary

**Processor and enabler method contracts are now locked together by executable parity tests for card and transitional embedded, including advertised builder support and unsupported-method no-side-effect regressions.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-02T17:30:42Z
- **Completed:** 2026-06-02T17:35:47Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added `processor/test/unit/contract/payment-method-contract.test.ts` importing actual processor and enabler registry exports.
- Compared registry public contract fields in deterministic order: `key`, `kind`, `advertisedType`, `displayName`, `transitional`, and `pspMetadata`.
- Proved processor `SUPPORTED_PAYMENT_METHODS` matches processor registry keys and enabler registry keys.
- Proved processor `isSupportedPaymentMethod()` accepts all enabler registry keys and rejects `paypal`, `dropin`, and empty method names.
- Asserted Phase 1 concrete advertised output: `components: [{ type: "card" }]`, `dropins: [{ type: "embedded" }]`, and `express: []`.
- Asserted `embedded` remains a `dropin`, uses advertised type `embedded`, and retains `transitional: true` while advertised.
- Asserted all Phase 1 PSP metadata remains empty.
- Bound `/payment-components` route expectations to the processor registry instead of hard-coded route-test literals.
- Added enabler assertions that every registry-advertised method can create the corresponding component or drop-in builder.
- Extended processor no-side-effect regressions so parity unsupported examples `paypal` and `dropin` reject with `METHOD_UNSUPPORTED` before cart reads, Nuvei `openOrder`, or CT Payment creation.

## Task Commits

1. **Task 1: Cross-package payment method parity tests** - `8b30ce7` (test)
2. **Task 2: Advertised methods bound to enabler builders** - `ef30349` (test)
3. **Task 3: Unsupported-method no-side-effect regressions** - `606ea4e` (test)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `processor/test/unit/contract/payment-method-contract.test.ts` - New cross-package parity tests comparing actual registry exports, `/payment-components` advertisements, enabler builder support, transitional embedded marker, and empty PSP metadata.
- `processor/test/unit/routes/operation.route.test.ts` - Derives expected `/payment-components` output from the processor registry and still asserts concrete Phase 1 output.
- `processor/test/unit/services/nuvei-payment.service.test.ts` - Covers `paypal`, `dropin`, and `wechatpay` unsupported examples with safe `METHOD_UNSUPPORTED` errors and no Nuvei/CT side effects.
- `enabler/test/unit/payment-enabler.test.ts` - Verifies every registry-advertised method can create its enabler builder, with embedded still treated as transitional.

## Decisions Made

- Kept mirrored package-local registries; the parity test is the enforcement mechanism rather than a shared module.
- Treated `dropin` as unsupported, not as an alias for `embedded`, matching Plan 02.
- Kept PSP metadata empty for every Phase 1 registry entry per D-07.

## Deviations from Plan

### Auto-fixed Issues

None - plan scope executed as specified.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope expansion.

## Issues Encountered

- `gsd-tools` was unavailable in this shell, so state/roadmap updates were applied directly rather than through SDK query handlers.

## Verification

Focused tests from the plan were run only:

- `cd processor && npm test -- --run test/unit/contract/payment-method-contract.test.ts` — passed, 5 tests.
- `cd processor && npm test -- --run test/unit/contract/payment-method-contract.test.ts test/unit/routes/operation.route.test.ts` — passed, 12 tests across 2 files.
- `cd processor && npm test -- --run test/unit/services/nuvei-payment.service.test.ts test/unit/contract/payment-method-contract.test.ts` — passed, 40 tests across 2 files.
- `cd enabler && npm test -- --run test/unit/payment-enabler.test.ts` — passed, 19 tests.

## Known Stubs

None. Empty `pspMetadata` values are intentional Phase 1 reserved metadata per D-07 and are asserted by parity tests.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None. The plan already covered mirrored registry drift, `/payment-components` advertisement drift, and unsupported-method side-effect prevention.

## Next Phase Readiness

- Phase 1 contract and method hardening is complete for card and transitional embedded.
- Phase 2 can rely on executable contract coverage while gathering Nuvei sandbox evidence for real PSP metadata and reconciliation behavior.

## Self-Check: PASSED

- FOUND: `.planning/phases/01-contract-and-method-hardening/01-03-SUMMARY.md`
- FOUND: `processor/test/unit/contract/payment-method-contract.test.ts`
- FOUND: implementation commit `8b30ce7`
- FOUND: implementation commit `ef30349`
- FOUND: implementation commit `606ea4e`
- Focused processor and enabler verification commands passed.

---
*Phase: 01-contract-and-method-hardening*
*Completed: 2026-06-02*
