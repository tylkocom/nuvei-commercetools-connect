# Domain Pitfalls

**Domain:** Nuvei commercetools Checkout payment connector
**Researched:** 2026-06-02
**Overall confidence:** HIGH for repository-specific risks and commercetools payment-connector principles; MEDIUM for Nuvei sandbox payload behavior until real DMN fixtures are captured.

## Critical Pitfalls

Mistakes that can cause duplicate charges, missing transactions, misattributed Payments, security incidents, or production rollback.

### Pitfall 1: Correlating DMNs with the wrong commercetools Payment

**What goes wrong:** A Nuvei DMN updates the wrong commercetools Payment, or cannot find any Payment, because the connector mixes `clientUniqueId`, `merchant_unique_id`, session token, `PPP_TransactionID`, and `TransactionID` without a single canonical strategy.

**Repo evidence:**
- `createPaymentIntent()` sends `clientUniqueId: cart.id` to `openOrder` and stores the returned Nuvei `sessionToken` as the Payment interaction/interface reference.
- The browser card component sends `merchant_unique_id: paymentRes.paymentReference` to Nuvei `createPayment()`.
- `processNuveiDmn()` currently requires `merchant_unique_id` and treats it as the commercetools Payment ID.
- `assertDmnMatchesNuveiStatus()` requires DMN `clientUniqueId` and compares it with Nuvei `getPaymentStatus().clientUniqueId` and the Payment amount/currency.
- Nuvei docs identify `merchant_unique_id` and `clientUniqueId` as separate optional merchant-supplied identifiers in payment DMNs, and DMN parameters are case-sensitive.

**Warning signs:**
- Processor logs: `Missing merchant_unique_id in DMN body`, `DMN is missing clientUniqueId`, `Nuvei payment status clientUniqueId does not match DMN`, `Nuvei payment status does not match cart`, or 400 responses on otherwise valid DMNs.
- commercetools Payment remains `Pending` while Nuvei shows approved.
- A Payment has a successful transaction whose amount/currency matches but whose cart/session does not.
- Sandbox payloads show `merchant_unique_id` missing, renamed, set to cart ID, or different between card, drop-in, 3DS, capture, cancel, and refund flows.

**Prevention:**
- In **Phase 3: Processor Reconciliation Improvements**, define one canonical correlation contract and assert every event against it: Payment ID from `merchant_unique_id`, cart ID from `clientUniqueId`, Nuvei session token from Payment `interfaceId`, and financial transaction ID from `TransactionID`/`transactionId`.
- Capture real sandbox DMN fixtures for authorization success, decline, 3DS frictionless, 3DS challenge, capture, cancel, refund, duplicate, missing-field, amount mismatch, and currency mismatch before production claims.
- Treat checksum validity as necessary but not sufficient: also require merchant/site match, Payment existence, cart/session relationship, amount/currency equality for financial success, and Nuvei `getPaymentStatus` confirmation where applicable.
- Fail closed on ambiguous or missing identifiers; do not fallback from Payment ID to cart ID unless explicitly proven and tested.

**Phase mapping:** Phase 2 validates real Checkout payloads; Phase 3 owns canonical correlation and reconciliation; Phase 6 adds fixture coverage.

### Pitfall 2: Duplicate, missing, or conflicting commercetools transactions

**What goes wrong:** Duplicate Nuvei DMNs or browser confirmation plus DMN both create the same Authorization/Charge/Refund transaction, or out-of-order events create a refund/cancel before the related transaction is safely known.

**Repo evidence:**
- Nuvei setup docs state duplicate DMNs may occur and the connector checks existing `interactionId`s.
- `confirmPayment()` writes an Authorization `Success` transaction using Nuvei `transactionId` after frontend confirmation.
- `processNuveiDmn()` skips only if the incoming `TransactionID` already exists in current Payment transaction `interactionId`s.
- Capture/cancel/refund pick the latest successful Authorization/Charge interaction ID, falling back to `payment.interfaceId` if no suitable transaction is found.
- commercetools payment integration best practices require idempotency and duplicate handling.

**Warning signs:**
- Multiple `Authorization` transactions with the same amount but different interaction IDs for one Payment.
- Capture uses the session token instead of the successful Authorization transaction ID.
- Nuvei reports `Invalid value of relatedTransactionId`, transaction already settled/credited/voided, or mismatched related transaction.
- Payment has both `Failure` and later `Success` for the same Nuvei transaction without clear status precedence.

**Prevention:**
- In **Phase 3**, make transaction identity explicit per operation: session token is not a financial transaction ID; Authorization/Charge/Refund/Cancel interaction IDs must be Nuvei financial transaction IDs.
- Idempotency should key on `(Nuvei transaction ID, transaction type, operation)` and preserve valid state transitions, not just raw `TransactionID` presence.
- Add out-of-order fixture tests: DMN before frontend confirmation, frontend confirmation before DMN, duplicate DMN after frontend confirmation, capture DMN after manual capture, refund DMN after asynchronous refund.
- For capture/cancel/refund, reject when the required prior successful transaction ID is absent instead of falling back silently to a session token.

**Phase mapping:** Phase 3 owns transition rules; Phase 6 owns duplicate/out-of-order test coverage; Phase 7 owns operational runbooks for repair.

### Pitfall 3: Treating browser confirmation as the final source of truth

**What goes wrong:** The enabler treats Web SDK `transactionStatus !== "APPROVED"` or a failed `/confirmPayments` call as a final payment failure, even though Nuvei documents that client-side Web SDK/Simply Connect responses are not verified and must be verified server-side by `getPaymentStatus` or DMN.

**Repo evidence:**
- `confirmPaymentResult()` immediately calls `onError` for any result whose `transactionStatus` is not `APPROVED`.
- `/confirmPayments/:id` returns rejected on any processor confirmation exception.
- `docs/PLAN.md` already flags browser-side confirmation as too binary and recommends tri-state pending/polling.
- Nuvei response-handling docs state Web SDK and Simply Connect responses are not verified and can differ from DMNs.

**Warning signs:**
- Shopper sees an error, then the Payment is later authorized by DMN.
- Checkout abandons a cart while Nuvei shows an approved transaction.
- `Payment confirmation failed` logs appear for sessions that later receive successful DMNs.
- Increased support tickets for 3DS challenge returns, timeouts, or `PENDING`/in-progress statuses.

**Prevention:**
- In **Phase 5: Security Hardening / Frontend Resilience**, introduce explicit `approved`, `rejected`, and `pending` states instead of binary success/error.
- Use server-side `getPaymentStatus` and DMN as authoritative; browser completion should only trigger verification.
- Add bounded polling against the processor after inconclusive browser results and surface safe “payment pending” UX instead of a hard error.
- In **Phase 3**, map Nuvei statuses `APPROVED`, `DECLINED`, `ERROR`, `PENDING`, `UPDATE`, expired, cancelled, and 3DS-action-required distinctly.

**Phase mapping:** Phase 2 validates real Checkout behavior; Phase 3 owns processor status mapping; Phase 5 owns browser pending/polling; Phase 6 adds tests.

### Pitfall 4: 3DS flows break due to hardcoded or incomplete shopper/billing data

**What goes wrong:** 3DS frictionless or challenge flows fail, require unexpected challenge, or cannot be reconciled because the connector sends hardcoded billing data and no real shopper email/context.

**Repo evidence:**
- `CardComponent.init()` sends `billingAddress: { country: "US", email: "" }` to Nuvei `createPayment()`.
- `docs/PLAN.md` and `.planning/PROJECT.md` call out hardcoded billing data as an active production gap.
- Nuvei response codes include invalid/missing country, email, user details, origin URL, and 3DS authentication failures.
- Nuvei testing docs provide distinct 3DS test scenarios, including frictionless and challenge flows.

**Warning signs:**
- 3DS enrolled cards fail only in certain countries/currencies.
- Nuvei errors such as invalid country code, missing/invalid user details, invalid origin URL, 3D authentication failure, or payment still in progress.
- DMN contains 3DS fields (`3dflow`, `threeDSVersion`, `3DauthenticationType`, `ChallengeCancelReason`) not represented in Payment logs or tests.
- Checkout Complete mode works but Payment Only mode fails because cart billing/shipping prerequisites differ.

**Prevention:**
- In **Phase 2**, validate both Complete Checkout and Payment Only with Nuvei 3DS frictionless and challenge cards.
- In **Phase 3/4**, decide which safe 3DS fields are stored only as non-sensitive metadata or logged as redacted diagnostics.
- Replace hardcoded browser billing with Checkout/session/cart/shopper-derived data or explicit validated enabler options in the phase that hardens Checkout contracts.
- Validate country, email, locale, origin/return URL, and amount/currency before creating the Nuvei session; fail early with actionable errors.

**Phase mapping:** Phase 1 defines required contract fields; Phase 2 validates 3DS E2E; Phase 3 reconciles 3DS DMNs; Phase 6 fixture-tests 3DS paths.

### Pitfall 5: Checksum validation accepts the wrong payload shape or rejects valid DMNs

**What goes wrong:** Valid Nuvei DMNs are rejected because of casing, algorithm, encoding, or plus-space normalization differences; or invalid DMNs are accepted because the checksum is calculated over the wrong fields.

**Repo evidence:**
- `NuveiClient.validateDmnChecksum()` uses `totalAmount`, `currency`, `responseTimeStamp`, `PPP_TransactionID`/`PPP_TransactionId`, `Status`, `productId`, and `advanceResponseChecksum`.
- `validateConfig()` currently rejects any `NUVEI_DMN_CHECKSUM_ALGORITHM` other than `sha256`, while older docs mention MD5 as possible and Nuvei recommends SHA-256.
- Nuvei docs state DMN parameters are case-sensitive, blank spaces appear as `+` and should be replaced with spaces, and the checksum uses exact ordered fields with merchant secret prefixed.
- `docs/OPERATIONS.md` still mentions sha256 default and legacy md5, which now conflicts with `validateConfig()`.

**Warning signs:**
- Spike in DMN HTTP 400 responses with `checksum validation failed` after environment changes.
- `advanceResponseChecksum` exists but computed checksum mismatches only for payloads with spaces, encoded fields, or field casing variations.
- Operations docs tell support to set MD5, but deployment validation rejects it.
- Nuvei dashboard shows sent DMNs that processor refuses before correlation logic runs.

**Prevention:**
- In **Phase 5**, lock policy to SHA-256 unless a real merchant site proves MD5 is required; update operations docs and config accordingly.
- Add real signed sandbox DMN fixtures for form-encoded and JSON bodies, including plus signs/spaces and `PPP_TransactionID` casing variants.
- Keep timing-safe comparison and reject malformed/non-hex checksums.
- Log only redacted diagnostic fields: merchant/site mismatch, algorithm, payload field presence, computed/received length; never log secret or raw checksum input.

**Phase mapping:** Phase 3 verifies checksum before reconciliation; Phase 5 hardens security/logging; Phase 6 adds fixture tests; Phase 7 updates runbooks.

### Pitfall 6: Secrets, tokens, or sensitive card-adjacent data leak through logs

**What goes wrong:** Nuvei secret key, session tokens, checksums, card/customer DMN fields, or raw PSP response bodies appear in structured logs, browser errors, or support artifacts.

**Repo evidence:**
- `NuveiPaymentService.redactToken()` is used for session tokens in several logs.
- `NuveiApiError` stores the raw response body, and operations docs say `responseBody` contains Nuvei error details.
- Nuvei DMN docs show DMNs can include customer details, masked card number, token fields, BIN, UPO IDs, address, phone, email, and 3DS details.
- Project constraints prohibit exposing secrets, checksums, session tokens, PANs, or raw sensitive payment data.

**Warning signs:**
- Logs include `NUVEI_SECRET_KEY`, `advanceResponseChecksum`, `checksum`, `sessionToken`, `Token`, `userPaymentOptionId`, `cardNumber`, `bin`, email/address/phone, or raw DMN bodies.
- Frontend `onError` receives Nuvei raw `reason` text containing processor/internal information.
- Support runbooks ask operators to paste full DMN payloads into tickets.

**Prevention:**
- In **Phase 5**, implement a centralized redaction helper for logs and errors; apply it to Nuvei API responses, DMNs, request bodies, and thrown error details.
- Allowlist log fields rather than blacklist known sensitive keys.
- Return safe shopper messages from frontend and processor routes; retain only redacted transaction IDs and correlation IDs for support.
- Store no PAN; if card display metadata is needed, use only Nuvei-provided non-sensitive method/brand/masked values after a specific storage decision.

**Phase mapping:** Phase 5 owns redaction and safe errors; Phase 7 owns operational logging/runbooks.

### Pitfall 7: CORS, session authentication, or JWT scope failures block Checkout traffic

**What goes wrong:** Browser Checkout cannot call the processor, or processor operation routes fail, because allowed origins, session headers, JWT issuer/JWKS, or API client scopes are misconfigured.

**Repo evidence:**
- Browser API calls send `X-Session-ID`; payment routes require `SessionHeaderAuthenticationHook`.
- `setupFastify()` allows origins from `config.checkoutUrl` plus `CORS_ALLOWED_ORIGINS` and permits `X-Session-ID`.
- `/status` checks commercetools permissions including `manage_payments`, `view_sessions`, `view_api_clients`, `manage_checkout_payment_intents`, and `introspect_oauth_tokens`.
- commercetools Checkout setup docs require connector API clients with scopes including `manage_payments`, `view_sessions`, `manage_orders`, and `manage_checkout_payment_intents`.

**Warning signs:**
- Browser console CORS preflight failures for `/payments` or `/payments/confirmPayments/:id`.
- Processor returns 401/403 for payment creation from Checkout but works in local mocks.
- `/status` reports CoCo permissions `DOWN`.
- Complete Checkout works from one region/application but not another because `CTP_CHECKOUT_URL`, JWKS, issuer, or session URL region differs.

**Prevention:**
- In **Phase 1**, make enabler options and processor route contracts explicit: required `processorUrl`, `sessionId`, environment, merchant IDs, and exact route/auth expectations.
- In **Phase 7**, document region-specific `CTP_*` URLs, `CTP_CHECKOUT_URL`, allowed origins, and required OAuth scopes in deployment checklists.
- Keep DMN webhook auth separate from browser/session/JWT auth; webhooks should validate Nuvei checksum and merchant/site, not require shopper session headers.
- Add deployed-environment smoke checks for `/health`, authenticated `/status`, browser `/payments` preflight, and a real Checkout session.

**Phase mapping:** Phase 1 contract hardening; Phase 2 E2E Checkout validation; Phase 7 deployment/operations.

### Pitfall 8: Nuvei SDK SRI pinning or CDN load failure permanently breaks checkout

**What goes wrong:** The browser cannot load `safecharge.js` because the SRI hash is stale, the CDN is blocked, or the initial script request fails; the cached rejected promise prevents retry for the page lifecycle.

**Repo evidence:**
- `loadNuveiSdk()` injects `https://cdn.safecharge.com/safecharge_resources/v1/websdk/safecharge.js` with a pinned `sha384` integrity value.
- `sdkLoadPromise` is cached globally and is not reset when script `onerror` rejects or when `SafeCharge` is missing after load.
- `docs/PLAN.md` flags failed load recovery and SRI rotation documentation as completion items.

**Warning signs:**
- `isAvailable()` returns false until full page reload after a transient network failure.
- Browser console shows SRI mismatch, blocked script, failed CDN request, or `Nuvei SafeCharge SDK not found after script load`.
- Multiple components on one page race to insert or attach listeners to the same script.
- A Nuvei SDK release changes the script hash without the connector asset being updated.

**Prevention:**
- In **Phase 5**, reset `sdkLoadPromise` on failure and remove/replace failed script nodes safely.
- Test single insertion, concurrent calls, existing script reuse, missing `window.SafeCharge`, and retry after failure.
- Maintain a documented SRI rotation process: fetch current SDK, compute hash, update constant, deploy enabler, and validate in sandbox before production.
- Keep CSP/CDN allowlist requirements in deployment docs.

**Phase mapping:** Phase 5 frontend resilience; Phase 6 enabler tests; Phase 7 operations docs.

### Pitfall 9: Package-manager and deployment documentation drift

**What goes wrong:** Operators follow root-level or pnpm instructions that do not match the repository, causing failed Connect deployment, unrepeatable builds, or different dependency graphs between local and deployed environments.

**Repo evidence:**
- The repository has separate `processor/package-lock.json` and `enabler/package-lock.json`; there is no root package manifest or pnpm lockfile in the workspace tree.
- `connect.yaml` scripts use `npm install && npm run connector:*` for processor deployment hooks.
- `docs/PLAN.md` calls out README/deployment docs claiming root-level pnpm commands despite npm/package-lock layout.

**Warning signs:**
- Merchant Center deployment logs fail during install/build/postDeploy.
- Developers run different package managers and produce lockfile churn.
- Docs refer to commands that cannot run from repository root.
- Dependency versions differ between local verification and Connect deployment.

**Prevention:**
- In **Phase 7**, choose one package strategy. For the current repo, prefer documenting npm per package unless a root workspace is intentionally added.
- Align README, deployment docs, testing docs, and `connect.yaml` with the same commands.
- Add CI install/build/test jobs per package in **Phase 6/7** once quality gates are in scope.
- Do not introduce pnpm/yarn lockfiles unless the deployment scripts and docs are changed in the same phase.

**Phase mapping:** Phase 6 CI coverage; Phase 7 deployment standardization.

### Pitfall 10: Unsupported method expansion breaks the card-first reconciliation baseline

**What goes wrong:** Wallets/APMs/drop-in variants are advertised or accepted before method-specific Nuvei parameters, statuses, asynchronous timing, and DMN fields are supported, multiplying reconciliation and security paths.

**Repo evidence:**
- `SUPPORTED_PAYMENT_METHODS` currently includes `card` and `dropin`; processor returns `dropins: [{ type: "embedded" }]` and `components: [{ type: "card" }]`.
- `paymentMethodOptions` are accepted but not passed to `openOrder`; current method choice mostly affects commercetools metadata.
- Nuvei payment DMNs differ for APMs and may include `PENDING`, `UPDATE`, `externalTransactionId`, `APMReferenceID`, provider-specific payer info, and delayed final DMNs.
- `.planning/PROJECT.md` explicitly defers wallets/APMs until card payment baseline is stable.

**Warning signs:**
- Merchant Center displays a method that the enabler cannot build or processor cannot reconcile.
- Nuvei returns unsupported payment method, wrong payment method, domain registration, or method not enabled errors.
- APM `PENDING` transactions get mapped as final failures or successes.
- New method metadata appears in Payment without method-specific capture/refund/cancel support.

**Prevention:**
- In **Phase 1**, centralize the supported-method registry and make unsupported methods fail consistently in enabler, processor validation, and `/payment-components`.
- In **Phase 4**, define metadata and display behavior for supported card/drop-in only.
- In **Phase 8**, require each new method to ship with method-specific Nuvei request parameters, sandbox fixtures, DMN mapping, idempotency rules, shopper data requirements, and operations runbooks.
- Do not advertise wallets/APMs just because Nuvei Web SDK supports them; only advertise methods proven in this connector.

**Phase mapping:** Phase 1 contract hardening; Phase 4 metadata; Phase 8 optional expansion after card baseline.

## Moderate Pitfalls

### Pitfall 11: Amount and currency conversion edge cases

**What goes wrong:** Decimal Nuvei amounts are converted to commercetools cent amounts incorrectly, especially for zero-decimal or unusual-currency fraction digits, causing false mismatch rejects or incorrect transaction amounts.

**Warning signs:**
- DMN amount mismatch errors only for JPY/KRW-like or non-2-decimal currencies.
- Rounding differences between `openOrder` formatted amount and DMN `totalAmount`.
- Nuvei DMN includes `convertedCurrency`/`convertedAmount` while connector compares only original `currency`/`totalAmount`.

**Prevention:**
- Keep using `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`, but add fixture tests per supported currency class.
- Defer DCC/MCP and partial approval until explicit requirements exist; reject or flag converted/partial fields safely.
- Compare success DMNs to `amountPlanned` unless a deliberate multi-currency strategy is added.

**Phase mapping:** Phase 3 reconciliation; Phase 6 test expansion.

### Pitfall 12: Operation routes report approved before asynchronous PSP settlement is final

**What goes wrong:** Capture/cancel/refund operations report approved/received based on immediate API response, but later Nuvei DMNs may differ or arrive out of order.

**Warning signs:**
- commercetools Payment shows `Charge`/`Refund` success while Nuvei later sends failure or pending update.
- Refunds are marked `RECEIVED` but no later DMN updates the transaction state.
- Operators cannot tell whether a refund is pending, settled, or failed.

**Prevention:**
- In **Phase 3**, treat operation API response and DMN as separate events reconciled by transaction IDs.
- In **Phase 7**, add runbooks for failed capture, failed refund, missing operation DMN, and Nuvei outage.
- Add fixture tests for operation DMNs before claiming final operation correctness.

**Phase mapping:** Phase 3 processor reconciliation; Phase 6 fixtures; Phase 7 operations.

### Pitfall 13: Error responses leak PSP internals or give shoppers unusable messages

**What goes wrong:** Shopper-facing `onError` gets raw Nuvei reasons or generic HTTP failures that are either unsafe or impossible to act on.

**Warning signs:**
- Browser shows `Failed to create payment: 400 Bad Request` or raw `reason` strings.
- Logs have useful detail but no correlation ID included in shopper-safe support message.
- Declines and technical failures are indistinguishable to Checkout.

**Prevention:**
- Map errors into safe categories: validation error, declined, pending, technical failure, unavailable.
- Include correlation/request IDs in logs and support-safe responses; avoid raw PSP reasons in the browser.
- Keep detailed Nuvei diagnostics server-side and redacted.

**Phase mapping:** Phase 1 contract; Phase 5 safe errors; Phase 7 support runbooks.

## Minor Pitfalls

### Pitfall 14: Documentation readiness claims drift ahead of evidence

**What goes wrong:** Public docs imply production readiness while sandbox E2E, DMN fixtures, and operational runbooks remain incomplete.

**Warning signs:**
- README says production-ready/MVP-complete while `.planning/PROJECT.md` and `docs/PLAN.md` list active critical gaps.
- Operators rely on docs that omit known limitations.

**Prevention:**
- Update docs only to claims supported by observed sandbox evidence.
- Keep “known limitations” explicit until the phase acceptance criteria are complete.

**Phase mapping:** Phase 7 deployment/operations; milestone audit before rollout.

### Pitfall 15: DMN payload storage/support handling captures too much personal data

**What goes wrong:** Real sandbox/production DMNs are copied into files or tickets with customer details and card-adjacent fields.

**Warning signs:**
- Fixture files include real email, address, phone, BIN, masked card, token, or UPO IDs without redaction policy.
- Support asks Nuvei or merchants for full raw DMNs instead of redacted payloads.

**Prevention:**
- Create redacted fixtures: preserve field names, statuses, identifiers needed for correlation, amount/currency, and checksum test cases; remove or synthetic-replace customer/card fields.
- Keep a separate signed-fixture strategy for checksum tests using synthetic secrets and payloads.

**Phase mapping:** Phase 5 security; Phase 6 fixture coverage; Phase 7 support runbooks.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Phase 1: Contract Hardening | Enabler, processor, and Merchant Center advertise different supported methods or require undocumented options. | Single method registry; validate `processorUrl`, `sessionId`, merchant IDs, environment, callbacks, and method IDs early. |
| Phase 2: End-to-End Checkout Validation | Browser success/decline/3DS paths appear to work locally but fail in real Checkout due to sessions, CORS, return URLs, or billing data. | Test Complete Checkout and Payment Only against deployed processor with Nuvei sandbox cards and captured logs. |
| Phase 3: Processor Reconciliation | DMN, frontend confirmation, and operation events compete or update different Payments. | Canonical IDs; amount/currency checks; idempotency by Nuvei transaction and operation; reject ambiguous events. |
| Phase 4: Payment Method Metadata | Card brand/APM identifiers are stored inconsistently or include sensitive data. | Typed safe metadata registry; allowlist stored/displayed fields; no PAN/token/customer data. |
| Phase 5: Security Hardening | Checksum, SDK, logging, CORS, and safe error handling are treated as independent cleanup instead of payment safety controls. | Central redaction, signed DMN validation, deterministic SDK loader, safe shopper messages, request size limits. |
| Phase 6: Test Coverage Expansion | Tests assert default strings/config instead of behavior that prevents financial mistakes. | Fixture-based DMN tests, out-of-order and duplicate scenarios, 3DS statuses, capture/cancel/refund transaction ID selection. |
| Phase 7: Deployment And Operations | Runbooks and commands do not match deployed Connect package layout or real Nuvei dashboard settings. | Standardize npm/package-lock or intentionally add workspace; document DMN URL, checksum policy, scopes, origins, and log queries. |
| Phase 8: Optional Payment Method Expansion | APM/wallet support is added by registry entry only. | Require method-specific Nuvei params, domain/account setup, fixtures, status model, reconciliation, and runbooks before advertising. |

## Sources

- `.planning/PROJECT.md` — project core value, active gaps, constraints, and scope decisions.
- `docs/PLAN.md` — completion findings and prioritized reconciliation/frontend/deployment work.
- `docs/NEXT_STEPS_PLAN.md` — phase names and acceptance criteria used for phase mapping.
- `docs/OPERATIONS.md` — current runbooks, health/status, auth scope, checksum, logging claims.
- `docs/NUVEI_SETUP.md` — DMN setup, expected fields, checksum formula, duplicate DMN notes, sandbox testing expectations.
- `processor/src/services/nuvei-payment.service.ts` — current openOrder, confirmation, DMN, idempotency, and operation behavior.
- `processor/src/services/converters/nuvei-event.converter.ts` — DMN-to-transaction mapping and required fields.
- `processor/src/clients/nuvei.client.ts` — Nuvei request signing and DMN checksum implementation.
- `processor/src/server/server.ts` — CORS, body limits, raw-body setup, security headers.
- `enabler/src/components/card.ts`, `enabler/src/services/api-service.ts`, `enabler/src/services/nuvei-sdk.ts` — browser payment creation, confirmation, and SDK loader behavior.
- `connect.yaml`, `processor/package.json`, `enabler/package.json` — deployment scripts and package-manager reality.
- commercetools documentation search result: Payment integration template best practices — idempotency, webhook validation, duplicate handling, fault tolerance, PCI, and Checkout connector model.
- commercetools documentation search result: Checkout setup — connector API client scopes and Checkout session architecture.
- Nuvei Payment DMNs documentation: https://docs.nuvei.com/documentation/integration/webhooks/payment-dmns/ — DMN parameters, checksum authentication, pending/final statuses, sensitive fields.
- Nuvei Response Handling documentation: https://docs.nuvei.com/documentation/integration/response-handling/ — client response verification requirement, status/error indicators, relevant error codes.
- Nuvei Testing Cards documentation: https://docs.nuvei.com/documentation/integration/testing/testing-cards/ — sandbox card and 3DS scenario coverage.
