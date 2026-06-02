---
phase: 01-contract-and-method-hardening
plan: 02
subsystem: payments
tags: [processor, fastify, typebox, nuvei, commercetools, validation]
requires: []
provides:
  - Processor mirrored payment method registry for card and transitional embedded methods
  - Registry-derived /payment-components response contract
  - Pre-side-effect processor payment method validation
  - Safe public payment setup error schema and mapper
  - Focused processor route and service regression tests
affects: [phase-01-contract-and-method-hardening, phase-02-nuvei-sandbox-evidence]
tech-stack:
  added: []
  patterns:
    - Package-local mirrored registry with empty PSP metadata until sandbox evidence
    - PaymentSetupError mapped to public { code, message } route responses
    - Defensive service validation before Nuvei openOrder or CT Payment creation
key-files:
  created:
    - processor/src/dtos/operations/payment-errors.dto.ts
    - processor/test/unit/routes/nuvei-payment.route.test.ts
  modified:
    - processor/src/dtos/operations/payment-components.dto.ts
    - processor/src/dtos/nuvei-payment.dto.ts
    - processor/src/routes/nuvei-payment.route.ts
    - processor/src/services/nuvei-payment.service.ts
    - processor/src/services/ct-payment-creation.service.ts
    - processor/test/unit/services/nuvei-payment.service.test.ts
    - processor/test/unit/routes/operation.route.test.ts
key-decisions:
  - "Processor accepts exactly card and transitional embedded method keys; dropin is not a processor payment method alias."
  - "Phase 1 PSP metadata remains intentionally empty until Nuvei sandbox evidence is gathered."
  - "No-options legacy payment creation defaults to card explicitly."
patterns-established:
  - "Payment method advertisements, supported keys, and CT display names are derived from PAYMENT_METHOD_REGISTRY."
  - "PaymentSetupError carries safe public code/message plus redacted diagnostics for route/service logging."
requirements-completed: [CONT-02, CONT-03, CONT-04, CONT-05]
duration: not recorded
completed: 2026-06-02
---

# Phase 1 Plan 2: Processor Contract Hardening Summary

**Processor payment setup now rejects unsupported or malformed methods before Nuvei openOrder or commercetools Payment creation, with registry-derived card/embedded advertisements and safe public errors.**

## Performance

- **Duration:** Not recorded by executor start hook
- **Started:** Not recorded by executor start hook
- **Completed:** 2026-06-02T17:27:05Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Replaced the processor flat method list with `PAYMENT_METHOD_REGISTRY` containing exactly `card` and transitional `embedded`, with empty PSP metadata.
- Derived `/payment-components` and CT Payment display names from the processor registry.
- Tightened TypeBox payment method input to Phase 1 shapes and added defensive service validation for unsupported, empty, multi-key, non-object, and malformed method payloads.
- Moved method validation to the first line of `createPaymentIntent()` so invalid setup does not read the cart, call Nuvei `openOrder`, or create a commercetools Payment.
- Added `PaymentSetupError`, `PublicPaymentErrorCode`, and `PublicPaymentErrorSchema` for safe `{ code, message }` public route responses with redacted diagnostics.
- Added focused processor service/route tests for registry behavior, no-side-effect rejection, legacy default card behavior, safe route errors, and redacted logging.

## Task Commits

Implementation tasks were committed together because the service validation, route mapper, DTO contract, and focused tests are mutually dependent in the same files:

1. **Tasks 1-3: Processor registry, validation, and safe setup errors** - `c960cfc` (feat)

**Plan metadata:** recorded in executor completion output

## Files Created/Modified

- `processor/src/dtos/operations/payment-components.dto.ts` - Defines processor mirrored registry, supported method helper, display-name map, and payment-components schemas.
- `processor/src/dtos/operations/payment-errors.dto.ts` - Defines public setup error schema, codes, messages, and `PaymentSetupError`.
- `processor/src/dtos/nuvei-payment.dto.ts` - Narrows payment method options to registry-backed `card` or `embedded` empty payloads.
- `processor/src/routes/nuvei-payment.route.ts` - Maps known setup errors to safe 400/422 `{ code, message }` responses and redacted route logs.
- `processor/src/services/nuvei-payment.service.ts` - Validates method options before any cart/Nuvei/commercetools side effect and derives advertised components from registry.
- `processor/src/services/ct-payment-creation.service.ts` - Uses registry-derived method display names.
- `processor/test/unit/services/nuvei-payment.service.test.ts` - Covers registry, default card, valid card/embedded, malformed/unsupported no-side-effect rejection, and redacted setup logs.
- `processor/test/unit/routes/operation.route.test.ts` - Keeps `/payment-components` route expectation aligned with registry output.
- `processor/test/unit/routes/nuvei-payment.route.test.ts` - Covers safe route mapping for malformed and unsupported setup errors.

## Decisions Made

- `embedded` is the transitional processor method key for the embedded drop-in; `dropin` is intentionally not accepted by the processor.
- Missing `paymentMethodOptions` is treated as a legacy/default `card` setup path.
- Method option payloads for Phase 1 must be empty objects; PSP request-shaping metadata remains unavailable until Phase 2 sandbox evidence.

## Deviations from Plan

### Auto-fixed Issues

None - plan scope executed as specified.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope expansion.

## Issues Encountered

- `gsd-tools` was unavailable in this shell, so state/roadmap/requirements updates were applied directly rather than through the SDK query handlers.
- Per-task TDD commits were not split after implementation because the same service and service-test files carry registry, validation, and error-mapping behavior. The delivered implementation commit is atomic for the processor-side contract slice.

## Verification

Focused processor tests from the plan were run after implementation:

- `cd processor && npm test -- --run test/unit/services/nuvei-payment.service.test.ts` — passed, 33 tests.
- `cd processor && npm test -- --run test/unit/routes/nuvei-payment.route.test.ts test/unit/services/nuvei-payment.service.test.ts` — passed, 36 tests.
- `cd processor && npm test -- --run test/unit/services/nuvei-payment.service.test.ts test/unit/routes/operation.route.test.ts` — passed, 40 tests.

## Known Stubs

None found in files created or modified by this plan.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None. The plan already covered the changed browser-to-processor payment setup boundary, route-to-Nuvei side-effect boundary, route-to-commercetools side-effect boundary, and operator log boundary.

## Next Phase Readiness

- Processor registry and validation are ready for Plan 03 parity tests against the enabler registry/builders.
- Phase 2 can continue treating PSP request-shaping metadata as unknown until sandbox evidence is captured.

## Self-Check: PASSED

- FOUND: `.planning/phases/01-contract-and-method-hardening/01-02-SUMMARY.md`
- FOUND: `processor/src/dtos/operations/payment-errors.dto.ts`
- FOUND: `processor/test/unit/routes/nuvei-payment.route.test.ts`
- FOUND: implementation commit `c960cfc`

---
*Phase: 01-contract-and-method-hardening*
*Completed: 2026-06-02*
