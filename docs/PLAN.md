# Completion Plan

## Current State

The connector has a working first-pass implementation for a Nuvei/commercetools Connect payment flow. Processor and enabler tests pass, and both packages build successfully. However, several production-critical gaps remain before the project should be treated as complete or production-ready.

Verification performed:

- `processor`: `npm test` passed, 83 tests.
- `processor`: `npm run build` passed.
- `enabler`: `npm test` passed, 42 tests.
- `enabler`: `npm run build` passed.

## Key Findings

1. DMN correlation still needs sandbox proof. The enabler now sends the commercetools Payment ID as Nuvei `merchant_unique_id` during browser payment creation, and DMN processing cross-checks Nuvei status against DMN `clientUniqueId`. Real Nuvei sandbox payloads still need to confirm `merchant_unique_id` is returned exactly as sent for all relevant flows.

2. `paymentMethodOptions` are accepted and validated, but they are not passed into Nuvei `openOrder`. Current method selection mostly affects commercetools metadata, not PSP behavior.

3. Billing data is hardcoded in the enabler. Card and drop-in flows send `country: "US"` and an empty email instead of using Checkout, cart, or shopper data.

4. The Nuvei SDK loader cannot recover after a failed script load because the rejected promise remains cached for the page lifecycle.

5. Documentation overstates readiness. The README claims the project is production-ready and MVP-complete, while the next-steps documentation still lists contract hardening, E2E validation, reconciliation, security, and CI work.

6. Build and deployment documentation do not match the repository layout. The README documents root-level `pnpm` commands, but there is no root package manifest or `pnpm-lock.yaml`; packages currently use npm lockfiles and `connect.yaml` runs `npm install`.

7. No CI workflow exists, so build, typecheck, and test verification are manual.

## Prioritized Completion Plan

### 1. Fix Payment Correlation

- Confirm with real Nuvei sandbox payloads which fields are returned in DMNs.
- Ensure every DMN can map reliably to exactly one commercetools Payment.
- Store or derive the Nuvei identifiers needed for later capture, cancel, refund, and reconciliation.
- Add tests for out-of-order DMNs and any correlation fields observed only in sandbox payloads.

### 2. Harden Webhook Processing

- Use real Nuvei sandbox fixtures for success, failure, 3DS, cancel, capture, refund, and duplicate events.
- Add safe logging with redaction for webhook failures.

### 3. Wire Real Shopper And Billing Data

- Replace hardcoded billing country and empty email with data from Checkout/session/cart context or explicit enabler options.
- Confirm the minimum Nuvei billing fields needed for card and 3DS flows.
- Add validation so missing required billing fields fail with actionable errors.

### 4. Clarify Payment Method Handling

- Create a single supported-method registry pattern for processor and enabler.
- Keep card and drop-in behavior aligned between `GET /payment-components`, enabler builders, and processor validation.
- Pass method-specific options to Nuvei where applicable, or remove unused options to avoid misleading behavior.
- Decide whether `dropin` is a production mode or only a transitional fallback.

### 5. Improve Frontend Resilience

- Reset the cached SDK load promise after failed script loads so retry is possible.
- Test single insertion, concurrent load calls, existing script reuse, and failed load recovery.
- Document the SRI hash update and rotation process for the Nuvei SDK.

### 6. Validate End To End In Sandbox

- Test Complete Checkout and Payment Only modes in a commercetools sandbox.
- Cover successful authorization, declined cards, 3DS challenge/redirect behavior, duplicate DMNs, capture, cancel authorization, and refund.
- Capture real logs and payloads for support/runbook documentation.

### 7. Standardize Build And Deployment

- Choose npm or pnpm as the package manager strategy.
- Add root-level workspace orchestration if root commands should be supported.
- Update `README.md`, deployment docs, testing docs, and `connect.yaml` so commands and package manager assumptions match reality.
- Verify Connect `postDeploy` and `preUndeploy` scripts in a real environment.

### 8. Add CI Quality Gates

- Add CI for both `processor` and `enabler`.
- Run install, build, typecheck if separate, and tests for each package.
- Fail pull requests on broken builds or tests.

### 9. Update Project Status Documentation

- Replace production-ready/MVP-complete claims until sandbox E2E and reconciliation are proven.
- Document known limitations clearly.
- Add runbooks for failed authorization, missing DMN, failed capture, failed refund, and Nuvei outage.

## Suggested Milestones

### Milestone 1: Reconciliation Correctness

- Canonical ID strategy implemented.
- Real DMN fixtures added.
- Webhook idempotency and safe failure logging fixed.

### Milestone 2: Checkout Contract Correctness

- Billing/shopper data is configurable or sourced correctly.
- Payment method support is explicit and consistently validated.

### Milestone 3: Production Readiness

- Sandbox E2E flows completed.
- CI added.
- Deployment docs corrected.
- Operational runbooks added.

### Milestone 4: Optional Expansion

- Add Apple Pay, Google Pay, APMs, express payments, or stored payment methods only after the card baseline is stable.
