# Synthesized Constraint Intel

source: .planning/intel/classifications/*.json plus source docs

## Constraint type breakdown

- api-contract: 9
- schema: 3
- nfr: 11
- protocol: 9

## Constraints

### CONSTRAINT-connect-shape
source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md
Type: api-contract
Content: Connector uses commercetools Connect with `enabler` assets and `processor` service. Browser must not call commercetools Payments API directly; DMN must not be a separate standalone app; payment creation should not use commercetools API Extensions.

### CONSTRAINT-native-payment-fields
source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; .planning/PROJECT.md; .planning/REQUIREMENTS.md
Type: api-contract
Content: Payment metadata uses native commercetools Payment fields (`interfaceId`, `paymentMethodInfo.method`, `paymentStatus.interfaceCode`, and `transactions[]`). Custom Types are not created unless a later proven requirement changes that policy.

### CONSTRAINT-supported-methods
source: .planning/STATE.md; .planning/phases/01-contract-and-method-hardening/01-CONTEXT.md; docs/TEST_SCENARIOS.md; docs/NEXT_STEPS_PLAN.md
Type: api-contract
Content: Current supported methods are `card` and transitional `embedded`. Unsupported wallets/APMs must not be advertised. `dropin` terminology appears in docs but current planning says `dropin` is not a processor payment method alias.

### CONSTRAINT-endpoint-current
source: docs/TEST_SCENARIOS.md; docs/PAYMENT_CONFIRMATION_POLLING.md; .planning/REQUIREMENTS.md; .planning/phases/01-contract-and-method-hardening/01-CONTEXT.md
Type: api-contract
Content: Current/planned route names include `GET /config`, `GET /status`, `GET /payment-components`, `POST /payments`, `POST /payments/confirmPayments/:paymentId`, `POST /payment-intents/:paymentId`, and `POST /webhooks/nuvei`. Conflicting older source docs list `/nuvei/*` endpoints; see conflict report.

### CONSTRAINT-health-status
source: docs/DEPLOYMENT.md; docs/OPERATIONS.md; docs/TESTING.md; docs/ARCHITECTURE.md
Type: api-contract
Content: `GET /health` is unauthenticated and returns `{ "status": "ok" }`. `GET /status` requires JWT authentication and reports overall status plus commercetools permission checks and Nuvei API reachability without leaking secrets.

### CONSTRAINT-auth-models
source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; docs/TEST_SCENARIOS.md
Type: api-contract
Content: Frontend/session routes use session auth; server-managed Payment Intents operations use OAuth2 plus scoped authorization; status/internal routes use JWT; webhooks rely on raw body checksum verification.

### CONSTRAINT-payment-components
source: docs/TEST_SCENARIOS.md; docs/NEXT_STEPS_PLAN.md; .planning/REQUIREMENTS.md
Type: api-contract
Content: `GET /payment-components` must advertise only methods that the enabler can build and the processor can process.

### CONSTRAINT-confirmation-outcome
source: docs/PAYMENT_CONFIRMATION_POLLING.md
Type: api-contract
Content: Confirmation/status response should use tri-state `approved | rejected | pending`; hard HTTP errors are reserved for invalid auth/session/access/payload/correlation errors.

### CONSTRAINT-nuvei-api-surface
source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; docs/NUVEI_SETUP.md
Type: api-contract
Content: Nuvei API operations are `openOrder`, `getPaymentStatus`, `settleTransaction`, `voidTransaction`, and `refundTransaction` under the REST v1/Simply Connect style API.

### CONSTRAINT-polling-cadence
source: docs/PAYMENT_CONFIRMATION_POLLING.md
Type: protocol
Content: Browser/enabler owns bounded polling cadence and timeout, polls only the processor, keeps requests non-overlapping, and reports unresolved timeout as pending/processing.

### CONSTRAINT-processor-stateless-status
source: docs/PAYMENT_CONFIRMATION_POLLING.md
Type: protocol
Content: Processor remains stateless for status checks, checks commercetools Payment before Nuvei, calls Nuvei only if not final, and updates Payment idempotently when Nuvei returns a final state.

### CONSTRAINT-transaction-mapping
source: docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md; docs/NUVEI_SETUP.md; docs/TESTING.md
Type: protocol
Content: Nuvei `Auth`/`PreAuth` map to `Authorization`; `Settle`/`Sale` to `Charge`; `Credit` to `Refund`; `Void` to `CancelAuthorization`; `Chargeback` to `Chargeback`. Nuvei `OK` maps to `Success`, `FAIL` to `Failure`, other statuses to `Pending` unless a later spec refines handling.

### CONSTRAINT-interface-code-mapping
source: docs/ARCHITECTURE.md; docs/TESTING.md
Type: protocol
Content: Successful authorization sets `authorized`; successful charge sets `paid`; successful refund sets `refunded`; successful cancel authorization sets `cancelled`; failures set `failed`.

### CONSTRAINT-dmn-url
source: docs/DEPLOYMENT.md; docs/NUVEI_SETUP.md; docs/OPERATIONS.md; docs/TEST_SCENARIOS.md
Type: protocol
Content: Nuvei DMN webhook URL format is `https://service-<id>.<region>.gcp.commercetools.app/webhooks/nuvei` or `{CONNECT_SERVICE_URL}/webhooks/nuvei` and must be manually configured in the Nuvei dashboard.

### CONSTRAINT-dmn-checksum-formula
source: docs/NUVEI_SETUP.md; docs/OPERATIONS.md; docs/DEPLOYMENT.md; docs/IMPLEMENTATION_PLAN.md; docs/ARCHITECTURE.md
Type: protocol
Content: DMN checksum uses `secretKey + totalAmount + currency + responseTimeStamp + PPP_TransactionID + Status + productId` and must be compared with `advanceResponseChecksum` using timing-safe comparison. Algorithm policy conflicts across docs; see conflict report.

### CONSTRAINT-dmn-field-casing
source: docs/NUVEI_SETUP.md
Type: schema
Content: DMN field casing may vary for `TransactionID`/`TransactionId` and `PPP_TransactionID`/`PPP_TransactionId`; known variants must be handled.

### CONSTRAINT-unsigned-dmn-fields
source: docs/security-review.md
Type: protocol
Content: `merchant_unique_id`, `TransactionID`, `transactionType`, `ppp_status`, and `clientUniqueId` are not covered by the documented checksum formula and must be treated as untrusted until revalidated against Nuvei/API/payment state.

### CONSTRAINT-dmn-replay-protection
source: docs/security-review.md
Type: protocol
Content: Persist processed webhook IDs or checksum-relevant immutable identifiers with TTL, reject stale `responseTimeStamp` values, and dedupe on immutable Nuvei event/transaction identifiers rather than only CT transaction `interactionId`.

### CONSTRAINT-amount-validation
source: docs/security-review.md; docs/TEST_SCENARIOS.md
Type: schema
Content: Capture/refund schemas should enforce positive integer cent amounts, validate currency format, and compare requested amounts against authorized/captured/refunded CT Payment totals before Nuvei calls.

### CONSTRAINT-processor-url-https
source: docs/security-review.md
Type: nfr
Content: Enabler `processorUrl` must require `https:`; any `http://localhost` exception must be explicit development mode only.

### CONSTRAINT-return-url-allowlist
source: docs/security-review.md
Type: nfr
Content: `merchantReturnUrl` must be validated against an explicit origin allowlist before being returned or used.

### CONSTRAINT-sensitive-data-redaction
source: docs/security-review.md; docs/IMPLEMENTATION_PLAN.md; docs/TEST_SCENARIOS.md; docs/OPERATIONS.md
Type: nfr
Content: No PAN, raw card data, secrets, session tokens, checksums, CT credentials, or sensitive raw payload fields may be exposed to shoppers or logged unsafely.

### CONSTRAINT-sdk-sri
source: docs/DEPLOYMENT.md; docs/security-review.md; docs/NEXT_STEPS_PLAN.md
Type: nfr
Content: Nuvei Web SDK loads from `https://cdn.safecharge.com/safecharge_resources/v1/websdk/safecharge.js` with SRI. Intentional updates require reviewing the new SDK and recomputing SHA-384 SRI. CI/build-time verification is recommended/missing.

### CONSTRAINT-package-strategy-current
source: docs/PLAN.md; docs/TEST_SCENARIOS.md; .planning/PROJECT.md; .planning/STATE.md
Type: nfr
Content: Current repository layout uses package-local `processor/package-lock.json` and `enabler/package-lock.json`, package-local npm commands, no root package manifest, and no `pnpm-lock.yaml` in the current working tree.

### CONSTRAINT-package-strategy-pnpm-variant
source: docs/DEPLOYMENT.md; docs/TESTING.md; docs/IMPLEMENTATION_PLAN.md; docs/OPERATIONS.md; docs/ARCHITECTURE.md
Type: nfr
Content: Several docs prescribe root `pnpm`, `pnpm --filter`, root `packageManager`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml`. This conflicts with current planning/repo reality and must not be silently imported.

### CONSTRAINT-node-runtime
source: docs/DEPLOYMENT.md; docs/IMPLEMENTATION_PLAN.md
Type: nfr
Content: Node.js >= 20 is required; processor serves HTTP on port 8080 in Connect runtime.

### CONSTRAINT-env-required
source: docs/DEPLOYMENT.md; docs/TEST_SCENARIOS.md; docs/OPERATIONS.md
Type: schema
Content: Required configuration includes commercetools project/auth/API/session/JWKS/JWT/Checkout URLs, CT client credentials, Nuvei env/merchant/site/API/secret values, and deployment-specific service/return URLs where applicable.

### CONSTRAINT-api-client-scopes
source: docs/DEPLOYMENT.md; docs/OPERATIONS.md; docs/IMPLEMENTATION_PLAN.md
Type: nfr
Content: Required/starting scopes include `manage_payments`, `view_sessions`, `view_api_clients`, `manage_checkout_payment_intents`, and `introspect_oauth_tokens`; some docs also list `manage_orders` and potential later scopes.

### CONSTRAINT-cors
source: docs/DEPLOYMENT.md; docs/security-review.md; docs/TEST_SCENARIOS.md
Type: nfr
Content: `CORS_ALLOWED_ORIGINS` is optional comma-separated configuration; CORS must be allowlist-based and validated in deployed environments.

### CONSTRAINT-testing-evidence
source: docs/TEST_SCENARIOS.md; docs/TESTING.md; docs/IMPLEMENTATION_PLAN.md
Type: nfr
Content: Manual/sandbox evidence should record Checkout mode, cart/payment/order IDs, Nuvei session token, Nuvei transaction ID, browser result, CT transactions before/after DMN, Nuvei dashboard state, and processor log excerpts.

### CONSTRAINT-readiness-gate
source: docs/PLAN.md; docs/TEST_SCENARIOS.md; docs/IMPLEMENTATION_PLAN.md; .planning/PROJECT.md
Type: nfr
Content: Production/card-first completion claims are blocked until sandbox Checkout/Payment Only, DMN correlation, operations, mismatch/security behavior, CI, and docs accuracy are proven.
