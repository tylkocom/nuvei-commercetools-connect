# Next Steps Plan

## Purpose

This plan outlines the features and improvements that should follow the first-pass Web SDK component work in the enabler. The goal is to move the Nuvei connector from a working card-first implementation toward a production-ready Checkout connector with stronger contracts, better operational confidence, and clear future expansion paths.

## Current Baseline

- Enabler exposes an embedded drop-in builder and a first-pass `card` Web Component builder.
- Processor advertises `embedded` drop-in and `card` component support.
- Processor can create Nuvei `openOrder` sessions, create commercetools Payments, confirm payment status, process DMNs, and support capture/cancel/refund operations.
- Unit tests and TypeScript builds pass for the current implementation.

## Phase 1: Contract Hardening

### Goals

Make the Checkout-facing enabler and processor contracts explicit, validated, and difficult to misuse.

### Work Items

- Define a documented contract for `NuveiEnabler` constructor options, component builders, drop-in builders, callbacks, and expected processor responses.
- Add stricter runtime validation in the enabler for required options: `processorUrl`, `sessionId`, `merchantId`, `merchantSiteId`, and `env`.
- Validate component types centrally so unsupported methods fail consistently in enabler and processor.
- Align `GET /payment-components` with the exact component IDs expected in Merchant Center configuration.
- Decide whether `dropin` should remain a long-term supported mode or only exist as a transitional fallback.

### Acceptance Criteria

- Invalid enabler configuration fails early with actionable errors.
- Processor and enabler expose the same supported payment method list.
- Checkout can render the `card` Web Component using only documented inputs.

## Phase 2: End-to-End Checkout Validation

### Goals

Prove the connector works in commercetools Checkout, not only in unit tests.

### Work Items

- Create a sandbox E2E test plan for Complete Checkout and Payment Only mode.
- Add a minimal browser harness for loading `connector-enabler.es.js` against a deployed processor.
- Verify the card Web Component renders, submits, confirms, and calls `onComplete` in Checkout.
- Verify declined cards call `onError` and create/update Failure transactions correctly.
- Verify 3DS challenge flows, redirects, and return behavior against Nuvei sandbox.
- Verify DMN arrives after frontend confirmation and remains idempotent.

### Acceptance Criteria

- Successful authorization creates a commercetools Payment with successful Authorization transaction.
- Declined payment creates or updates a Failure transaction without leaking raw Nuvei errors to the shopper.
- Duplicate DMNs do not create duplicate transactions.

## Phase 3: Processor Reconciliation Improvements

### Goals

Strengthen data consistency between Nuvei and commercetools Payments.

### Work Items

- Confirm the canonical correlation ID strategy with real Nuvei DMN payloads.
- Ensure DMN correlation works when `clientUniqueId` is cart ID but `merchant_unique_id` is expected to be Payment ID.
- Store enough Nuvei identifiers to support capture, cancel, refund, and reconciliation without relying on ambiguous session tokens.
- Add explicit handling for Nuvei statuses that are pending, failed, cancelled, expired, or require additional customer action.
- Add tests for amount mismatch, currency mismatch, unknown payment method, missing transaction ID, and out-of-order DMNs.

### Acceptance Criteria

- Processor can reconcile frontend confirmation and DMN events for the same payment without conflicts.
- Capture/cancel/refund always use the correct Nuvei transaction identifier.
- Unexpected Nuvei payloads fail safely and are logged with redacted context.

## Phase 4: Payment Method Metadata

### Goals

Improve payment method observability and future extensibility.

### Work Items

- Replace the initial payment method name map with a typed registry for supported methods.
- Store meaningful `paymentMethodInfo.method` values such as `card`, card brand, or Nuvei APM identifier.
- Decide how card brand, masked details, and user payment option IDs should be represented without storing sensitive data.
- Ensure Merchant Center display labels remain configurable through Checkout where possible.

### Acceptance Criteria

- Payments are easy to identify in Merchant Center and logs.
- No PAN or sensitive card data is stored or logged.
- Adding a new method requires adding one registry entry and focused tests.

## Phase 5: Security Hardening

### Goals

Reduce risk around browser assets, processor APIs, webhook handling, and logging.

### Work Items

- Add tests for the Nuvei SDK loader to verify single script insertion, concurrent calls, and failed load recovery.
- Review the pinned Nuvei SDK SRI hash update process and document how to rotate it safely.
- Improve processor client error responses so shoppers receive safe messages while logs retain useful redacted diagnostics.
- Review all logs for token, checksum, secret, and payload redaction.
- Validate CORS configuration in deployed Connect environments.
- Add request size limits for frontend and webhook routes.

### Acceptance Criteria

- Browser SDK loading is deterministic and covered by unit tests.
- No secrets, session tokens, or raw payment data appear in logs.
- Webhook and frontend routes reject malformed input predictably.

## Phase 6: Test Coverage Expansion

### Goals

Increase confidence before preview and production rollout.

### Work Items

- Add enabler tests for `CardComponent.mount`, SDK load success/failure, processor errors, declined payment results, and confirmation failures.
- Add processor tests for `createPaymentIntent` with `card`, `dropin`, unsupported methods, and empty method options.
- Add DMN fixture tests based on real Nuvei sandbox payloads.
- Add route-level tests for `/payments`, `/payments/confirmPayments/:id`, `/payment-components`, and `/webhooks/nuvei`.
- Add build verification in CI for both `enabler` and `processor`.

### Acceptance Criteria

- Critical payment paths have unit or integration coverage.
- CI blocks changes that break tests or TypeScript builds.
- DMN fixtures cover success, failure, duplicate, malformed, and mismatch cases.

## Phase 7: Deployment And Operations

### Goals

Make Connect deployment repeatable and supportable.

### Work Items

- Update deployment docs to reflect npm/package-lock based deployment if that remains the chosen package manager.
- Verify Connect post-deploy and pre-undeploy scripts in a real environment.
- Document required Nuvei dashboard settings, especially DMN URL and checksum algorithm.
- Add runbooks for failed authorization, missing DMN, failed capture, failed refund, and Nuvei outage.
- Define operational dashboards or log queries for payment failures and webhook errors.

### Acceptance Criteria

- A new environment can be deployed from documentation alone.
- Support engineers can diagnose common failure modes from logs and runbooks.
- Deployment scripts match the repository package manager strategy.

## Phase 8: Optional Payment Method Expansion

### Goals

Expand beyond card payments after the card path is stable.

### Candidate Features

- Apple Pay and Google Pay, if Nuvei account setup and domain validation are available.
- Nuvei APMs as individual Web Components where supported.
- Express payment buttons if Checkout configuration requires them.
- Stored payment methods or tokenized repeat payments, only after security and data retention requirements are agreed.

### Acceptance Criteria

- New payment methods follow the same registry, validation, tests, and reconciliation model as `card`.
- No method expansion weakens the card payment baseline.

## Recommended Immediate Next Tasks

1. Validate the `card` Web Component in a real commercetools Checkout sandbox.
2. Capture real Nuvei DMN payloads for success, failure, 3DS, refund, and cancel flows.
3. Add SDK loader unit tests for concurrency and failure recovery.
4. Confirm correlation IDs between `openOrder`, frontend confirmation, and DMN.
5. Update deployment documentation to match the current npm-based repository layout.

## Open Questions

- Should `dropin` remain supported for production, or should Web Components become the only supported Checkout mode?
- Does Nuvei require method-specific `openOrder` parameters for Web Components beyond the current `paymentMethodOptions` metadata?
- What exact DMN field should be canonical for mapping a Nuvei event back to a commercetools Payment?
- Should failed frontend confirmation create a Payment Failure transaction immediately, or wait for DMN reconciliation when available?
- Which payment methods are contractually required after `card`?
