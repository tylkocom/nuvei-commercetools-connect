---
phase: 01-contract-and-method-hardening
plan: 01
subsystem: payments
tags: [enabler, contract-hardening, method-registry, vitest, nuvei]
requires: []
provides:
  - Enabler safe structured setup errors for invalid constructor options
  - Enabler mirrored payment method registry for card and transitional embedded
  - Registry-derived component and drop-in builder dispatch
  - Registry-derived card and embedded create-payment request keys
  - Safe preservation of processor create-payment error payloads
  - Focused enabler unit coverage for setup and method contract behavior
affects: [phase-01-contract-and-method-hardening, enabler, checkout-contract]
tech-stack:
  added: []
  patterns:
    - Package-local mirrored method registry with empty PSP metadata until sandbox evidence
    - Public PaymentSetupError contract exposing code and message with redaction-safe diagnostics
key-files:
  created:
    - enabler/src/payment-enabler/method-registry.ts
  modified:
    - enabler/src/payment-enabler/payment-enabler.ts
    - enabler/src/index.ts
    - enabler/src/components/card.ts
    - enabler/src/dropin/dropin-embedded.ts
    - enabler/src/services/api-service.ts
    - enabler/test/unit/payment-enabler.test.ts
    - enabler/test/unit/dropin.test.ts
key-decisions:
  - "Enabler registry uses embedded, not dropin, as the transitional drop-in request key for Phase 1."
  - "Public enabler setup failures use PaymentSetupError with stable code/message and redaction-safe diagnostics."
patterns-established:
  - "Method support is derived from PAYMENT_METHOD_REGISTRY rather than parallel hard-coded lists."
  - "Create-payment browser calls use registry method constants for paymentMethodOptions keys."
requirements-completed: [CONT-01, CONT-03, CONT-05]
duration: 3min
completed: 2026-06-02
---

# Phase 01 Plan 01: Enabler Contract and Method Hardening Summary

**Enabler setup now fails with safe structured errors and builds only registry-backed card plus transitional embedded payment methods.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-02T17:19:58Z
- **Completed:** 2026-06-02T17:22:52Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added `PaymentSetupError`, public payment error codes, and safe constructor validation for invalid enabler options.
- Added a package-local mirrored registry with exactly `card` and transitional `embedded` entries, with empty PSP metadata reserved for Phase 2 evidence.
- Derived `NuveiEnabler` component/drop-in builder dispatch from registry entries and rejected unsupported builders with `METHOD_UNSUPPORTED` before any SDK or processor side effects.
- Updated card and embedded drop-in create-payment calls to use registry-supported request keys: `{ card: {} }` and `{ embedded: {} }`.
- Preserved safe processor `{ code, message }` create-payment errors in the enabler API wrapper and converted non-public failures to a generic safe request error.

## Task Commits

Implementation was committed as one cohesive enabler contract change because the three planned tasks share the same public error and registry surface:

1. **Tasks 1-3: Enabler safe errors, mirrored registry, builder validation, and focused tests** - `7e757f6` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `enabler/src/payment-enabler/method-registry.ts` - Defines the enabler mirrored registry, supported method keys, method kind helpers, and support checks.
- `enabler/src/payment-enabler/payment-enabler.ts` - Re-exports registry helpers and defines safe public error types, `PaymentSetupError`, and hardened `validateEnablerOptions`.
- `enabler/src/index.ts` - Derives component/drop-in builder support from registry entries and throws structured unsupported-method errors.
- `enabler/src/components/card.ts` - Uses the registry `card` key for processor payment creation.
- `enabler/src/dropin/dropin-embedded.ts` - Uses the transitional registry `embedded` key for processor payment creation.
- `enabler/src/services/api-service.ts` - Preserves processor safe `{ code, message }` create-payment errors and avoids exposing raw response bodies.
- `enabler/test/unit/payment-enabler.test.ts` - Covers safe config errors, registry shape, unsupported builder side-effect prevention, and API safe error preservation.
- `enabler/test/unit/dropin.test.ts` - Covers embedded drop-in create-payment request key.

## Decisions Made

- Used `embedded` as the public request key for transitional drop-in instead of retaining the old untested `dropin` request key.
- Kept PSP metadata as empty objects for every Phase 1 registry entry, matching D-07 and avoiding Nuvei request-shaping guesses.
- Kept diagnostics on `PaymentSetupError` redaction-safe while public assertions use `toPublicError()` / `code` / `message`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Preserved processor safe create-payment errors in the enabler API wrapper**
- **Found during:** Task 3 (Make unsupported enabler builder requests fail safely before side effects)
- **Issue:** The existing fetch wrapper converted all create-payment non-2xx responses into raw status-text errors, which would discard the Phase 1 safe `{ code, message }` processor contract.
- **Fix:** Added safe response parsing for `POST /payments`; public processor error payloads are rethrown as `PaymentSetupError`, while non-public responses become a generic safe `REQUEST_MALFORMED` error.
- **Files modified:** `enabler/src/services/api-service.ts`, `enabler/test/unit/payment-enabler.test.ts`
- **Verification:** `cd enabler && npm test -- --run test/unit/payment-enabler.test.ts test/unit/card.test.ts test/unit/dropin.test.ts`
- **Committed in:** `7e757f6`

---

**Total deviations:** 1 auto-fixed (Rule 2 missing critical functionality)
**Impact on plan:** Required to satisfy Task 3 acceptance for safe processor error preservation. No scope expansion beyond the assigned enabler contract.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `cd enabler && npm test -- --run test/unit/payment-enabler.test.ts` — passed, 18 tests.
- `cd enabler && npm test -- --run test/unit/payment-enabler.test.ts test/unit/card.test.ts test/unit/dropin.test.ts` — passed, 33 tests across 3 files.

## Known Stubs

None. The empty `pspMetadata` registry values are intentional Phase 1 reserved metadata per D-07 and do not feed UI rendering.

## Threat Flags

None.

## Self-Check: PASSED

- Created/modified files listed in this summary exist.
- Implementation commit `7e757f6` exists in git history.
- Focused enabler verification commands passed.

## Next Phase Readiness

- Enabler-side CONT-01, CONT-03, and CONT-05 behavior is implemented and covered by focused unit tests.
- Processor-side mirrored registry and pre-side-effect rejection remain assigned to Plan 01-02.

---
*Phase: 01-contract-and-method-hardening*
*Completed: 2026-06-02*
