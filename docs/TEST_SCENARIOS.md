# Functional Testing Scenarios

## Table Of Contents

| Scenario | Purpose |
| --- | --- |
| [1. Static Quality Gate](#scenario-1-static-quality-gate) | Verifies processor and enabler tests and builds pass before manual testing starts. |
| [2. Processor Configuration Endpoint](#scenario-2-processor-configuration-endpoint) | Verifies session-authenticated clients can fetch safe frontend Nuvei configuration. |
| [3. Processor Status Endpoint](#scenario-3-processor-status-endpoint) | Verifies operational health checks for commercetools permissions and Nuvei reachability. |
| [4. Supported Payment Components](#scenario-4-supported-payment-components) | Verifies the processor advertises only payment methods the enabler can actually build. |
| [5. Enabler SDK Loading](#scenario-5-enabler-sdk-loading) | Verifies the browser asset loads the Nuvei SafeCharge SDK reliably and without duplicate scripts. |
| [6. Complete Checkout Card Authorization Success](#scenario-6-complete-checkout-card-authorization-success) | Verifies the main Complete Checkout card authorization path succeeds end to end. |
| [7. Payment Only Card Authorization Success](#scenario-7-payment-only-card-authorization-success) | Verifies the same authorization path works in commercetools Payment Only mode. |
| [8. Declined Card](#scenario-8-declined-card) | Verifies declined authorizations fail safely and are reflected correctly in commercetools. |
| [9. 3DS Frictionless Approval](#scenario-9-3ds-frictionless-approval) | Verifies frictionless 3DS approvals complete without shopper challenge and reconcile correctly. |
| [10. 3DS Step-Up Challenge Approval](#scenario-10-3ds-step-up-challenge-approval) | Verifies challenge-based 3DS approvals complete and return to the expected checkout state. |
| [11. 3DS Challenge Failure Or Abandonment](#scenario-11-3ds-challenge-failure-or-abandonment) | Verifies failed or abandoned 3DS flows do not create false successful payments. |
| [12. Dual-Mode Card Harness](#scenario-12-dual-mode-card-harness) | Verifies the example page can switch between Simply Connect and Web SDK card modes. |
| [13. Unsupported Payment Method](#scenario-13-unsupported-payment-method) | Verifies unsupported payment methods are rejected by both enabler and processor. |
| [14. Capture Authorized Payment](#scenario-14-capture-authorized-payment) | Verifies delayed capture settles a successful authorization using the correct Nuvei transaction. |
| [15. Partial Capture](#scenario-15-partial-capture) | Verifies partial capture works correctly or is explicitly rejected as unsupported. |
| [16. Cancel Authorization](#scenario-16-cancel-authorization) | Verifies uncaptured authorizations can be voided and reconciled. |
| [17. Refund Captured Payment](#scenario-17-refund-captured-payment) | Verifies captured payments can be refunded through the processor and Nuvei. |
| [18. Partial Refund](#scenario-18-partial-refund) | Verifies partial refunds match requested amounts and do not exceed captured totals. |
| [19. Reverse Authorized Payment](#scenario-19-reverse-authorized-payment) | Verifies reverse chooses cancel for authorized but uncaptured payments. |
| [20. Reverse Captured Payment](#scenario-20-reverse-captured-payment) | Verifies reverse chooses refund for captured payments. |
| [21. Duplicate DMN](#scenario-21-duplicate-dmn) | Verifies repeated Nuvei notifications do not create duplicate CT transactions. |
| [22. Invalid DMN Checksum](#scenario-22-invalid-dmn-checksum) | Verifies tampered or unauthenticated webhooks are rejected without modifying payments. |
| [23. DMN Missing Payment Correlation](#scenario-23-dmn-missing-payment-correlation) | Verifies DMNs without usable payment correlation fail safely. |
| [24. DMN Amount Or Currency Mismatch](#scenario-24-dmn-amount-or-currency-mismatch) | Verifies mismatched webhook amount or currency cannot alter payment state. |
| [25. Session Auth Rejection](#scenario-25-session-auth-rejection) | Verifies frontend payment routes reject missing or invalid session authentication. |
| [26. Payment Confirmation For Wrong Cart](#scenario-26-payment-confirmation-for-wrong-cart) | Verifies one session cannot confirm a payment belonging to another cart. |
| [27. Nuvei API Outage Or Timeout](#scenario-27-nuvei-api-outage-or-timeout) | Verifies the connector fails safely when Nuvei is unreachable. |
| [28. Custom Storefront Direct Usage](#scenario-28-custom-storefront-direct-usage) | Verifies the enabler can complete payment outside hosted Checkout when used directly. |
| [29. Deployment Script Verification](#scenario-29-deployment-script-verification) | Verifies Connect deployment hooks log the correct DMN URL and cleanup guidance. |
| [30. Documentation And Readiness Review](#scenario-30-documentation-and-readiness-review) | Verifies documentation matches actual repository layout, commands, and runtime behavior. |

## Brief Setup

1. Install dependencies for both packages:

```bash
cd processor
npm install
cd ../enabler
npm install
```

2. Verify the local code baseline:

```bash
cd processor
npm test
npm run build
cd ../enabler
npm test
npm run build
```

3. Prepare a commercetools sandbox project with a Connect deployment or local tunnel to the processor.

4. Configure the required processor environment variables:

```bash
CTP_PROJECT_KEY=...
CTP_CLIENT_ID=...
CTP_CLIENT_SECRET=...
CTP_AUTH_URL=https://auth.europe-west1.gcp.commercetools.com
CTP_API_URL=https://api.europe-west1.gcp.commercetools.com
CTP_SESSION_URL=https://session.europe-west1.gcp.commercetools.com
CTP_CHECKOUT_URL=https://checkout.europe-west1.gcp.commercetools.com
CTP_JWKS_URL=https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json
CTP_JWT_ISSUER=https://mc-api.europe-west1.gcp.commercetools.com
NUVEI_ENV=test
NUVEI_MERCHANT_ID=...
NUVEI_MERCHANT_SITE_ID=...
NUVEI_SECRET_KEY=...
NUVEI_API_BASE_URL=...
CONNECT_SERVICE_URL=...
RETURN_URL=...
```

5. Configure Nuvei sandbox to send DMNs to:

```text
{CONNECT_SERVICE_URL}/webhooks/nuvei
```

6. Create test carts with physical goods and attach Checkout sessions for both Complete Checkout and Payment Only modes.

7. Keep these inspection tools available:

- commercetools Merchant Center or API client to inspect Carts, Payments, Orders, and transactions.
- Nuvei sandbox dashboard to inspect orders, authorizations, captures, voids, refunds, and DMNs.
- Browser DevTools Network and Console tabs.
- Processor logs.

## Expected Test Evidence

For each scenario, record:

- Checkout mode: Complete Checkout, Payment Only, or custom storefront.
- Cart ID, Payment ID, Order ID if created, Nuvei session token, and Nuvei transaction ID.
- Browser result: success, decline, challenge, redirect, or error.
- commercetools Payment transactions before and after DMN.
- Nuvei dashboard transaction state.
- Processor log excerpt for the request path.

## Scenario 1: Static Quality Gate

Purpose: Confirm the repository builds and tests pass before manual payment testing.

Steps:

1. Run `npm test` in `processor`.
2. Run `npm run build` in `processor`.
3. Run `npm test` in `enabler`.
4. Run `npm run build` in `enabler`.
5. Confirm all commands exit with status `0`.

Expected result:

- Processor tests pass.
- Processor TypeScript build succeeds.
- Enabler tests pass.
- Enabler TypeScript and Vite build succeeds.
- `enabler/public/connector-enabler.es.js` and `enabler/public/connector-enabler.umd.js` are generated.

## Scenario 2: Processor Configuration Endpoint

Purpose: Confirm Checkout/session-authenticated clients can fetch frontend Nuvei configuration.

Steps:

1. Create or obtain a valid commercetools Checkout session.
2. Send `GET {PROCESSOR_URL}/config` with the required session authentication headers.
3. Inspect the response body.
4. Confirm no secret fields are returned.

Expected result:

- Response status is `200`.
- Response contains `environment`, `merchantId`, and `merchantSiteId`.
- Response does not contain `NUVEI_SECRET_KEY`, CT client credentials, checksums, or tokens.

## Scenario 3: Processor Status Endpoint

Purpose: Confirm operational health checks work with a valid JWT.

Steps:

1. Obtain a valid JWT accepted by the connector status route.
2. Send `GET {PROCESSOR_URL}/status` with the JWT.
3. Review each returned health check.
4. Temporarily test with invalid Nuvei credentials in a non-shared environment, if safe.

Expected result:

- With valid config, the response includes the running commit hash and all CT permission checks are `UP`.
- With valid config, Nuvei reachability is `UP`.
- With invalid Nuvei config, the Nuvei check reports `DOWN` without leaking secrets.

## Scenario 4: Supported Payment Components

Purpose: Confirm commercetools Checkout sees the same supported methods that the enabler implements.

Steps:

1. Send `GET {PROCESSOR_URL}/operations/payment-components` with a valid JWT.
2. Confirm `dropins` is empty.
3. Confirm `components` contains `card`.
4. Confirm unsupported production methods such as wallets or APMs are not advertised unless implemented.
5. Compare this response with Checkout-facing `Enabler.createComponentBuilder()` behavior and the Nuvei-specific enablers used by the local harness.

Expected result:

- Processor advertises only implemented methods.
- Enabler can build every advertised method.
- Unsupported methods fail with actionable errors.

## Scenario 5: Enabler SDK Loading

Purpose: Confirm the browser asset loads Nuvei SafeCharge SDK reliably.

Steps:

1. Open a browser page that loads `connector-enabler.es.js` or `connector-enabler.umd.js` from the deployed enabler asset URL.
2. Instantiate the Checkout-facing `Enabler` with valid `processorUrl` and `sessionId`; do not pass Nuvei merchant identifiers in the shopper page.
3. Create a card component builder with `createComponentBuilder("card")`.
4. Await `component.mount("#payment-container")`, then submit through `await component.submit({ storePaymentDetails: false })`.
5. Inspect DevTools Network for `https://cdn.safecharge.com/safecharge_resources/v1/websdk/safecharge.js`.
6. Reload the page and repeat mounting multiple components on the same page.

Expected result:

- Nuvei SDK is requested once per page lifecycle.
- `window.SafeCharge` becomes available.
- Component renders without console errors.
- Multiple component mounts do not inject duplicate script tags.

## Scenario 6: Complete Checkout Card Authorization Success

Purpose: Confirm the core Complete Checkout card authorization flow works.

Steps:

1. Create a cart with a physical product and a non-zero total.
2. Start a Complete Checkout session using the Nuvei connector.
3. Open the hosted Checkout page.
4. Select the Nuvei card payment method.
5. Enter a Nuvei sandbox card that should approve.
6. Submit the payment.
7. Wait for the frontend success callback.
8. Inspect the commercetools Payment attached to the cart.
9. Inspect the Nuvei sandbox transaction.
10. Wait for the DMN and inspect the Payment again.

Expected result:

- Nuvei widget renders.
- `POST /payments/session` creates a Nuvei session and a CT Payment.
- Frontend confirmation calls `POST /payments/confirm/:paymentId`.
- CT Payment has an `Authorization` transaction with state `Success`.
- Authorization `interactionId` prefers Nuvei `PPP_TransactionID`; when Nuvei status omits PPP, it uses Nuvei `TransactionID`/`transactionId` or the bound session token fallback.
- Nuvei dashboard shows an approved authorization.
- DMN processing does not create duplicate transactions.

## Scenario 7: Payment Only Card Authorization Success

Purpose: Confirm the same card authorization works in Payment Only mode.

Steps:

1. Create a cart or payment context suitable for Payment Only mode.
2. Start a Payment Only Checkout session using the Nuvei connector.
3. Open the Checkout page.
4. Select the Nuvei card component.
5. Enter an approving Nuvei sandbox card.
6. Submit payment.
7. Inspect the CT Payment after frontend confirmation.
8. Inspect the CT Payment after DMN arrival.

Expected result:

- Payment Only Checkout renders the enabler asset.
- Payment authorization succeeds.
- CT Payment has one successful `Authorization` with an idempotent Nuvei interaction ID: `PPP_TransactionID` when present, otherwise Nuvei transaction ID or the bound session token fallback.
- DMN processing does not create a duplicate terminal transaction when a later DMN provides a different PPP ID for an authorization already recorded from confirmation.

## Scenario 8: Declined Card

Purpose: Confirm failed authorizations are surfaced safely and reflected in commercetools.

Steps:

1. Start a Checkout session with the Nuvei card method.
2. Enter a Nuvei sandbox card configured to decline.
3. Submit payment.
4. Observe the shopper-facing error in Checkout.
5. Inspect browser console and network responses.
6. Inspect the CT Payment.
7. Inspect processor logs.

Expected result:

- Shopper sees a safe payment failure message.
- No raw Nuvei secret, checksum, or sensitive card data is shown.
- `POST /payments/confirm/:paymentId` returns HTTP `402` with `{ "outcome": "rejected" }`. The enabler routes business rejection through Checkout-compatible completion failure.
- CT Payment has an `Authorization` transaction with state `Failure` using Nuvei `PPP_TransactionID` when present, otherwise Nuvei transaction ID or the bound session token fallback.
- Processor logs include useful redacted context.

## Scenario 9: 3DS Frictionless Approval

Purpose: Confirm 3DS frictionless card flows complete without user challenge.

Steps:

1. Start a Checkout session with a cart requiring card payment.
2. Use a Nuvei sandbox card configured for 3DS frictionless approval.
3. Submit payment.
4. Confirm no step-up challenge is shown.
5. Inspect CT Payment after confirmation.
6. Inspect Nuvei dashboard and DMN logs.

Expected result:

- Payment completes without shopper challenge.
- CT Payment records successful `Authorization`.
- Nuvei transaction indicates 3DS frictionless approval where visible.
- DMN reconciles with the same CT Payment.

## Scenario 10: 3DS Step-Up Challenge Approval

Purpose: Confirm challenge-based 3DS flows complete correctly.

Steps:

1. Start a Checkout session with the Nuvei card method.
2. Use a Nuvei sandbox card configured for 3DS step-up challenge.
3. Submit payment.
4. Complete the challenge in the browser.
5. Confirm Checkout returns to the expected state or return URL.
6. Inspect CT Payment after confirmation.
7. Inspect Nuvei dashboard and processor logs.

Expected result:

- 3DS challenge is displayed and can be completed.
- User returns to Checkout or the configured return URL correctly.
- CT Payment has successful `Authorization`.
- No duplicate transaction is created by the DMN.

## Scenario 11: 3DS Challenge Failure Or Abandonment

Purpose: Confirm failed or abandoned 3DS flows do not create false successful payments.

Steps:

1. Start a Checkout session with a 3DS step-up sandbox card.
2. Submit payment.
3. Fail the challenge or close/abandon the challenge window if the sandbox supports it.
4. Return to Checkout.
5. Inspect CT Payment.
6. Inspect Nuvei dashboard and logs.

Expected result:

- Checkout does not show a successful payment.
- CT Payment has no successful `Authorization` for the abandoned attempt.
- Failure state is recorded if Nuvei provides a final failed status.
- Later DMNs do not incorrectly mark the payment successful.

## Scenario 12: Dual-Mode Card Harness

Purpose: Confirm the example harness can switch between Simply Connect and Web SDK card modes.

Steps:

1. Open `examples/nuvei-web-ui/index.html` in a browser.
2. Select Simply Connect card mode and mount the card.
3. Switch to Web SDK card mode and mount the card again.
4. Confirm the Pay button appears only in Web SDK mode.
5. Observe the result log for onComplete, onError, or onPending output.

Expected result:

- The example page renders the mode selector and card container.
- Simply Connect mode uses `NuveiSimplyConnectEnabler`.
- Web SDK mode uses `NuveiWebSdkEnabler`.
- The evidence harness can drive both card modes without additional payment UI variants.

## Scenario 13: Unsupported Payment Method

Purpose: Confirm unsupported payment methods fail predictably.

Steps:

1. In a browser harness, instantiate the Checkout-facing `Enabler`.
2. Call `createComponentBuilder("applepay")` or another unsupported method.
3. Observe the thrown error.
4. Send `POST {PROCESSOR_URL}/payments` with `paymentMethodOptions` containing the same unsupported method.
5. Inspect the processor response and logs.

Expected result:

- Enabler rejects unsupported method with a clear error.
- Processor rejects unsupported method with a safe error.
- No Nuvei order or CT Payment is created for unsupported methods.

## Scenario 14: Capture Authorized Payment

Purpose: Confirm delayed capture for physical goods works through the Payment Intents API.

Steps:

1. Complete a successful authorization scenario.
2. Confirm CT Payment has a successful `Authorization` transaction.
3. Trigger capture through `POST {PROCESSOR_URL}/payment-intents/:paymentId` using the expected capture action payload.
4. Inspect the response.
5. Inspect CT Payment transactions.
6. Inspect Nuvei dashboard.
7. Wait for related DMN and inspect CT Payment again.

Expected result:

- Processor calls Nuvei `settleTransaction` with the correct related transaction ID.
- Response outcome is approved or accepted according to the API contract.
- CT Payment has a `Charge` transaction.
- Nuvei dashboard shows captured/settled state.
- DMN does not create duplicate or conflicting charge transactions.

## Scenario 15: Partial Capture

Purpose: Confirm partial capture behavior or document it as unsupported.

Steps:

1. Complete a successful authorization for a cart total greater than the partial capture amount.
2. Trigger capture for a smaller amount through the Payment Intents API.
3. Inspect processor response.
4. Inspect CT Payment transactions and payment status.
5. Inspect Nuvei dashboard.

Expected result:

- If partial capture is supported, CT Payment records a `Charge` for the partial amount and Nuvei shows the matching amount.
- If partial capture is not supported, processor rejects the request safely and documents the limitation.
- No full-amount charge is created accidentally.

## Scenario 16: Cancel Authorization

Purpose: Confirm uncaptured authorizations can be voided.

Steps:

1. Complete a successful authorization and do not capture it.
2. Trigger cancel through `POST {PROCESSOR_URL}/payment-intents/:paymentId` using the expected cancel action payload.
3. Inspect processor response.
4. Inspect CT Payment transactions.
5. Inspect Nuvei dashboard.
6. Wait for DMN and re-check CT Payment.

Expected result:

- Processor calls Nuvei `voidTransaction` with the authorization transaction ID.
- CT Payment records `CancelAuthorization`.
- Nuvei dashboard shows void/cancel state.
- Duplicate DMN handling remains idempotent.

## Scenario 17: Refund Captured Payment

Purpose: Confirm refunds work after capture.

Steps:

1. Complete successful authorization.
2. Capture the payment successfully.
3. Trigger refund through `POST {PROCESSOR_URL}/payment-intents/:paymentId` using the expected refund action payload.
4. Inspect processor response.
5. Inspect CT Payment transactions.
6. Inspect Nuvei dashboard.
7. Wait for refund DMN and inspect CT Payment again.

Expected result:

- Processor calls Nuvei `refundTransaction` with the charge transaction ID.
- CT Payment records a `Refund` transaction.
- Nuvei dashboard shows refunded/credit state.
- DMN reconciliation does not duplicate the refund.

## Scenario 18: Partial Refund

Purpose: Confirm partial refunds behave correctly.

Steps:

1. Complete and capture a payment.
2. Trigger a refund for less than the captured amount.
3. Inspect CT Payment transaction amount.
4. Inspect Nuvei dashboard transaction amount.
5. Repeat with another partial refund if the business flow supports multiple refunds.

Expected result:

- Refund amount matches the requested amount.
- CT Payment remains internally consistent.
- Nuvei dashboard amount matches CT transaction amount.
- Multiple refunds do not exceed captured amount.

## Scenario 19: Reverse Authorized Payment

Purpose: Confirm reverse chooses cancel for authorized but uncaptured payments.

Steps:

1. Complete a successful authorization.
2. Trigger reverse through the Payment Intents API if supported by the request contract.
3. Inspect processor response.
4. Inspect CT Payment transactions.
5. Inspect Nuvei dashboard.

Expected result:

- Processor chooses `voidTransaction`.
- CT Payment receives `CancelAuthorization`.
- No refund is attempted for an uncaptured payment.

## Scenario 20: Reverse Captured Payment

Purpose: Confirm reverse chooses refund for captured payments.

Steps:

1. Complete and capture a payment.
2. Trigger reverse through the Payment Intents API if supported by the request contract.
3. Inspect processor response.
4. Inspect CT Payment transactions.
5. Inspect Nuvei dashboard.

Expected result:

- Processor chooses `refundTransaction`.
- CT Payment receives `Refund`.
- No cancel authorization is attempted for a captured payment.

## Scenario 21: Duplicate DMN

Purpose: Confirm repeated Nuvei notifications do not duplicate transactions.

Steps:

1. Capture a real valid DMN payload from processor logs or Nuvei tooling.
2. Send the same DMN payload to `POST {PROCESSOR_URL}/webhooks/nuvei` twice.
3. Inspect the response to both requests.
4. Inspect CT Payment transactions.
5. Inspect processor logs.

Expected result:

- First DMN is processed successfully.
- Second DMN returns success or a safe idempotent response.
- CT Payment does not receive duplicate transactions with the same interaction ID.
- Logs state that the duplicate DMN was skipped.

## Scenario 22: Invalid DMN Checksum

Purpose: Confirm unauthenticated or tampered webhooks are rejected.

Steps:

1. Capture a valid DMN payload.
2. Modify `totalAmount`, `currency`, `Status`, or `advanceResponseChecksum`.
3. Send the tampered payload to `POST {PROCESSOR_URL}/webhooks/nuvei`.
4. Inspect response and CT Payment.

Expected result:

- Processor returns `400`.
- CT Payment is not modified.
- Logs do not include secrets or raw card data.

## Scenario 23: DMN Missing Payment Correlation

Purpose: Confirm DMNs resolve to the exact CT Payment and never update an unrelated payment.

Steps:

1. Create or capture a DMN-like payload with a valid checksum, no `merchant_unique_id`, and a `sessionToken` that matches exactly one CT Payment `interfaceId`.
2. Send it to `POST {PROCESSOR_URL}/webhooks/nuvei`.
3. Repeat with `merchant_unique_id` set to an unknown CT Payment ID and the same valid `sessionToken`.
4. Repeat with no `merchant_unique_id` and no `sessionToken`.
5. Repeat with a `sessionToken` that matches zero or multiple CT Payments.
6. Inspect response, CT Payment state, and logs.

Expected result:

- Valid `sessionToken -> Payment.interfaceId` fallback updates only the matching Payment.
- Unknown `merchant_unique_id` falls back to session-token lookup when available.
- Cart-ID `merchant_unique_id` resolves through linked cart Payments only when amount/currency plus Nuvei transaction identity or a single existing terminal Payment identifies one exact Nuvei Payment; otherwise zero or ambiguous matches are rejected safely.
- No unrelated Payment is modified.

## Scenario 24: DMN Amount Or Currency Mismatch

Purpose: Confirm mismatched webhook data cannot alter the wrong payment state.

Steps:

1. Capture a valid DMN for a successful authorization.
2. Modify the amount or currency and recompute checksum only in a controlled test environment if possible.
3. Send the modified DMN.
4. Inspect CT Payment and logs.

Expected result:

- Processor rejects the mismatch.
- CT Payment is not updated.
- Logs include redacted context explaining the mismatch.

## Scenario 25: Session Auth Rejection

Purpose: Confirm frontend routes cannot be called without a valid session.

Steps:

1. Send `POST {PROCESSOR_URL}/payments/session` without session headers.
2. Send the same request with an invalid session ID.
3. Send `POST {PROCESSOR_URL}/payments/confirm/:paymentId` with an invalid session.
4. Inspect responses.

Expected result:

- Requests are rejected with auth errors.
- No Nuvei order is created.
- No CT Payment is created or modified.

## Scenario 26: Payment Confirmation For Wrong Cart

Purpose: Confirm one Checkout session cannot confirm another cart's payment.

Steps:

1. Create Checkout Session A and start a payment to create Payment A.
2. Create Checkout Session B for a different cart.
3. From Session B, call `POST /payments/confirm/:paymentAId` with Payment A's session token.
4. Inspect response and CT Payment A.

Expected result:

- Processor rejects the confirmation.
- Payment A is not marked successful from Session B.
- Logs explain the cart/payment mismatch without leaking tokens.

## Scenario 27: Nuvei API Outage Or Timeout

Purpose: Confirm the connector fails safely when Nuvei is unavailable.

Steps:

1. In a non-production environment, point `NUVEI_API_BASE_URL` to an unreachable HTTPS endpoint or block outbound access.
2. Start the processor.
3. Call `GET /status`.
4. Attempt `POST /payments/session` from a valid session.
5. Inspect response and logs.

Expected result:

- Status reports Nuvei as `DOWN`.
- Payment creation fails safely.
- No partial CT Payment is left attached to the cart unless intentionally created and recoverable.
- Logs include timeout/reachability context but no secrets.

## Scenario 28: Custom Storefront Direct Usage

Purpose: Confirm the enabler can be used outside hosted Checkout if that remains in scope.

Steps:

1. Create a simple browser page that loads the enabler asset.
2. Obtain a valid session ID through the merchant storefront or BFF flow.
3. Instantiate the Checkout-facing `Enabler` with the deployed processor URL and session ID.
4. Await mounting of the card component and submit through the host-owned submit flow.
5. Complete an approving sandbox payment.
6. Inspect CT Payment and Nuvei dashboard.

Expected result:

- Custom page can render and complete payment without hosted Checkout.
- Processor session auth still protects the cart/payment.
- CT Payment and Nuvei transaction states match.

## Scenario 29: Deployment Script Verification

Purpose: Confirm Connect deployment hooks behave as expected.

Steps:

1. Build the processor package.
2. Run `npm run connector:post-deploy` with `CONNECT_SERVICE_URL` set.
3. Confirm the logged DMN URL is correct.
4. Run `npm run connector:pre-undeploy`.
5. Confirm manual cleanup instructions are accurate.

Expected result:

- Post-deploy logs `{CONNECT_SERVICE_URL}/webhooks/nuvei`.
- Pre-undeploy logs clear manual Nuvei cleanup guidance.
- Any missing required environment value is documented or handled safely.

## Scenario 30: Documentation And Readiness Review

Purpose: Confirm docs match real behavior before declaring completion.

Steps:

1. Compare `README.md` setup commands with actual package layout.
2. Compare `connect.yaml` package manager assumptions with lockfiles.
3. Confirm `docs/DEPLOYMENT.md` references only implemented endpoints.
4. Confirm `docs/TESTING.md` points to actual test locations.
5. Confirm `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and `.planning/INGEST-CONFLICTS.md` capture or explicitly defer previously documented gaps.

Expected result:

- Docs do not claim unsupported behavior.
- Setup instructions can be followed by a new engineer.
- Remaining limitations are documented clearly.

## Completion Criteria

The connector can be considered functionally complete for the card-first MVP only when:

- Complete Checkout card authorization succeeds in sandbox.
- Payment Only card authorization succeeds in sandbox.
- Declined and failed 3DS flows fail safely.
- Successful frontend confirmation and DMN reconciliation do not duplicate transactions.
- Capture, cancel authorization, refund, and reverse flows use the correct Nuvei transaction IDs.
- DMN correlation works with real Nuvei payloads.
- Invalid checksums, mismatches, duplicate DMNs, and unauthorized sessions are rejected safely.
- Build and test commands are automated in CI.
- Documentation matches the actual deployment and runtime behavior.
