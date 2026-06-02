# Codebase Concerns

**Analysis Date:** 2026-06-02

## Tech Debt

**Processor API naming and route compatibility:**
- Issue: The active HTTP API exposes payment creation under `POST /payments`, confirmation under `POST /payments/confirmPayments/:id`, and Checkout operations under `POST /payment-intents/:id`. The roadmap explicitly tracks cleanup for route renames and an unauthenticated `GET /health`, while the current implementation keeps the compatibility surface in place.
- Files: `processor/src/routes/nuvei-payment.route.ts`, `processor/src/routes/operation.route.ts`, `processor/src/server/plugins/nuvei-payment.plugin.ts`, `processor/src/server/plugins/operation.plugin.ts`, `.planning/ROADMAP.md`
- Impact: New integrations need to preserve legacy names, documentation must explain multiple concepts with overlapping names, and infrastructure probes cannot use a dedicated unauthenticated health endpoint.
- Fix approach: Introduce the clean routes beside compatibility aliases, add `GET /health` for infrastructure-only liveness, migrate `enabler/src/services/api-service.ts`, `testing/postman-nuvei-connector-local-testing.collection.json`, and docs, then keep explicit deprecation coverage for any aliases that remain.

**Payment orchestration service is too large:**
- Issue: `NuveiPaymentService` owns configuration responses, health checks, amount formatting, payment method validation, payment creation, confirmation, capture/cancel/refund/reverse, DMN validation, DMN conversion coordination, and payment metadata updates in one 986-line class.
- Files: `processor/src/services/nuvei-payment.service.ts`, `processor/src/services/ct-payment-creation.service.ts`, `processor/src/services/converters/nuvei-event.converter.ts`
- Impact: Reconciliation-critical logic is difficult to review in isolation; changes to browser payment setup, webhook processing, or payment operations all risk accidental coupling inside the same class.
- Fix approach: Split by behavior boundary: payment session creation, frontend confirmation, payment-intent operations, DMN reconciliation, and shared amount/correlation helpers. Keep `NuveiPaymentService` as a thin coordinator or remove it once route dependencies can target smaller services.

**Payment method registry is duplicated:**
- Issue: Supported methods are mirrored in the browser package and processor package instead of being generated from one contract. The processor registry also marks `embedded` as `transitional`, while the enabler can build it.
- Files: `enabler/src/payment-enabler/method-registry.ts`, `processor/src/dtos/operations/payment-components.dto.ts`, `processor/test/unit/contract/payment-method-contract.test.ts`
- Impact: Parity tests catch drift after the fact, but adding a method still requires synchronized edits in two packages and can accidentally advertise a method that the other side cannot process.
- Fix approach: Promote the registry contract into a shared generated artifact or a single source copied during build/test setup, and require method-specific Nuvei request shaping and reconciliation evidence before adding non-card entries.

**Manual deployment hooks instead of managed Nuvei configuration:**
- Issue: Connect lifecycle scripts only print instructions for configuring/removing the DMN URL; they do not verify or apply Nuvei dashboard settings.
- Files: `processor/src/connectors/post-deploy.ts`, `processor/src/connectors/pre-undeploy.ts`, `connect.yaml`, `docs/DEPLOYMENT.md`
- Impact: Production readiness depends on an operator copying the correct webhook URL into Nuvei and removing it later. A missed step leaves payments without DMN reconciliation or leaves stale callbacks active.
- Fix approach: Keep the manual instruction as a fallback, add an operational verification command or documented dashboard check, and expose webhook URL/status in runbooks without requiring secrets in logs.

**Package-manager strategy is split in the working tree:**
- Issue: The repository uses npm scripts and `package-lock.json` in CI, while `enabler/bun.lock` and `processor/bun.lock` are present locally and `.gitignore` ignores `bun.lock`.
- Files: `enabler/package.json`, `enabler/package-lock.json`, `enabler/bun.lock`, `processor/package.json`, `processor/package-lock.json`, `processor/bun.lock`, `.github/workflows/connect-validate.yml`, `.gitignore`
- Impact: Developers can install different dependency graphs locally than CI validates, especially because there is no root workspace command that installs/builds/tests both packages consistently.
- Fix approach: Treat npm lockfiles as the source of truth or formally switch package managers; remove ignored lockfile drift from active development paths and add root-level package scripts only if the repo intentionally becomes a workspace.

## Known Bugs

**Empty payment-intent actions can crash the processor route:**
- Symptoms: `PaymentIntentRequestSchema` allows `actions: []` because it sets `maxItems: 1` without `minItems: 1`. `AbstractPaymentService.modifyPayment()` immediately reads `opts.data.actions[0]` and then `request.action`, which throws for an empty array.
- Files: `processor/src/dtos/operations/payment-intents.dto.ts`, `processor/src/services/abstract-payment.service.ts`, `processor/src/routes/operation.route.ts`
- Trigger: Send `POST /payment-intents/:id` with a valid auth context and body `{ "actions": [] }`.
- Workaround: Callers must always send exactly one action. The robust fix is schema-level `minItems: 1` plus a service-level guard that returns `ErrorInvalidOperation` instead of a generic internal error.

**Payment creation is not idempotent per cart/session:**
- Symptoms: Each `GET /payments`, `POST /payments`, or `POST /transactions` call creates a new Nuvei `openOrder` and a new commercetools Payment, then attaches it to the cart. No existing pending payment/session is reused.
- Files: `processor/src/routes/nuvei-payment.route.ts`, `processor/src/routes/operation.route.ts`, `processor/src/services/nuvei-payment.service.ts`, `processor/src/services/ct-payment-creation.service.ts`
- Trigger: Browser retry, shopper refresh, duplicate Checkout call, or network retry around payment setup.
- Workaround: Avoid client-side retries that call payment creation again. The robust fix is a per-cart/session idempotency key and lookup path that reuses or expires existing pending Nuvei sessions before creating another order.

**Payment modification accepts unbounded and non-positive amounts:**
- Symptoms: `AmountSchema` only requires integer `centAmount` and string `currencyCode`. `capturePayment()` and `refundPayment()` format any integer amount and call Nuvei without checking positivity, payment currency equality, remaining authorized amount, captured amount, or refundable balance.
- Files: `processor/src/dtos/operations/payment-intents.dto.ts`, `processor/src/services/nuvei-payment.service.ts`, `processor/src/services/abstract-payment.service.ts`
- Trigger: `POST /payment-intents/:id` with zero, negative, wrong-currency, over-capture, or over-refund amounts.
- Workaround: Only trusted Checkout callers should send validated amounts. The robust fix is schema-level positive amounts and service-level bounds against existing commercetools Payment transactions before any Nuvei operation.

**Nuvei API non-JSON responses surface as generic failures:**
- Symptoms: `NuveiClient.sendRequest()` calls `response.json()` before checking `response.ok` or handling parse failures. HTML, empty bodies, gateway errors, or malformed JSON throw a parse error rather than a structured `NuveiApiError` containing status and response body.
- Files: `processor/src/clients/nuvei.client.ts`, `processor/src/services/nuvei-payment.service.ts`
- Trigger: Nuvei outage, proxy error, WAF response, timeout race, or any non-JSON Nuvei response.
- Workaround: Operators need logs around the failing operation. The robust fix is to read text first, parse JSON only when present, include HTTP status safely, and keep response bodies redacted.

**Hosted payment widgets use placeholder billing data:**
- Symptoms: Both the card component and embedded drop-in send `billingAddress.country: "US"` and `email: ""` to Nuvei regardless of cart, customer, billing, locale, or shopper context.
- Files: `enabler/src/components/card.ts`, `enabler/src/dropin/dropin-embedded.ts`, `.planning/ROADMAP.md`
- Trigger: Any card or embedded drop-in payment session rendered by the enabler.
- Workaround: None in the public enabler options. The robust fix is to collect or receive validated shopper/billing fields and reject setup when required 3DS/payment fields are missing.

**Confirm-payment collapses all failures into a declined outcome:**
- Symptoms: `POST /payments/confirmPayments/:id` catches every error from `confirmPayment()` and returns status `400` with outcome `rejected`, including Nuvei outages, wrong-cart attempts, malformed status payloads, and internal commercetools update failures.
- Files: `processor/src/routes/nuvei-payment.route.ts`, `processor/src/services/nuvei-payment.service.ts`, `enabler/src/services/api-service.ts`
- Trigger: Any non-approved or exceptional confirmation path.
- Workaround: Inspect processor logs. The robust fix is to distinguish rejected payment, pending/inconclusive status, auth/session mismatch, Nuvei transport failure, and internal failure with safe public error codes.

## Security Considerations

**DMN pre-authentication only checks checksum presence:**
- Risk: The webhook pre-handler accepts any request body containing `advanceResponseChecksum`; cryptographic validation happens later in the route service. This is safe for integrity but gives unauthenticated callers access to the full JSON/form parser and service error path until checksum validation rejects them.
- Files: `processor/src/libs/fastify/hooks/nuvei-header-auth.hook.ts`, `processor/src/routes/nuvei-payment.route.ts`, `processor/src/services/nuvei-payment.service.ts`, `processor/src/server/server.ts`
- Current mitigation: `processNuveiDmn()` validates the SHA-256 checksum with `NuveiClient.validateDmnChecksum()` before loading or updating a payment; Fastify body size is capped at `100 * 1024`.
- Recommendations: Keep checksum validation first, add route-specific content-type expectations and rate limits if supported by the platform, and log invalid checksum attempts without echoing payload fields beyond safe identifiers.

**DMN correlation trusts `merchant_unique_id` before sandbox evidence locks canonical fields:**
- Risk: A checksum-valid DMN can select the commercetools Payment by `merchant_unique_id`. Successful authorization/charge DMNs are cross-checked with Nuvei `getPaymentStatus`, but other states and operation types rely more heavily on the signed DMN fields and amount/currency checks.
- Files: `processor/src/services/nuvei-payment.service.ts`, `processor/src/services/converters/nuvei-event.converter.ts`, `enabler/src/components/card.ts`, `enabler/src/dropin/dropin-embedded.ts`, `.planning/ROADMAP.md`
- Current mitigation: The service validates checksum, merchant ID/site ID, payment amount/currency, duplicate transaction IDs, and for successful authorization/charge DMNs verifies Nuvei status transaction/cart/payment fields.
- Recommendations: Store canonical Nuvei session/order/transaction correlation fields on the Payment, require them for every DMN type that mutates state, and reject checksum-valid events that cannot prove they belong to the Payment.

**Merchant return URL is exposed without an allowlist:**
- Risk: `createPaymentIntent()` returns `merchantReturnUrl` from session context or `RETURN_URL`; `validateConfig()` only enforces HTTPS for configured `RETURN_URL`. Session-provided return URLs are not allowlisted before browser exposure.
- Files: `processor/src/services/nuvei-payment.service.ts`, `processor/src/libs/fastify/context/context.ts`, `processor/src/config/config.ts`, `.planning/ROADMAP.md`
- Current mitigation: Configured `RETURN_URL` must use HTTPS when present.
- Recommendations: Add an explicit return-url allowlist and validate session-provided URLs against it before returning them to the enabler or passing them to Nuvei flows.

**Local secret files exist in the working tree:**
- Risk: Root `.env` and `processor/.env` files are present. `.gitignore` contains `.env`, but accidental quoting in docs, logs, tests, or generated artifacts would leak credentials.
- Files: `.env`, `processor/.env`, `.gitignore`, `processor/src/index.ts`, `processor/src/config/config.ts`
- Current mitigation: `.gitignore` ignores `.env`; `processor/src/index.ts` loads local env with `dotenv.config()`; committed config uses environment variable names, not secret values.
- Recommendations: Continue treating env files as unreadable secrets, keep docs to variable names only, and add secret scanning in CI before publishing or deploying.

**Logs include operational identifiers and error messages:**
- Risk: Logs intentionally include cart IDs, payment IDs, transaction IDs, interface codes, and some external error messages. Session tokens are redacted in several paths, but generic error messages from SDKs or Nuvei may contain sensitive material if upstream changes behavior.
- Files: `processor/src/services/nuvei-payment.service.ts`, `processor/src/clients/nuvei.client.ts`, `processor/src/libs/logger/index.ts`, `processor/src/routes/nuvei-payment.route.ts`
- Current mitigation: `redactToken()` redacts session tokens in service logs; public route errors avoid returning raw upstream errors for payment setup and DMN processing.
- Recommendations: Centralize redaction for session tokens, checksums, authorization headers, raw DMN fields, and upstream error payloads before logging.

## Performance Bottlenecks

**DMN processing can add multiple sequential commercetools updates per webhook:**
- Problem: A single DMN can call `ctPaymentService.updatePayment()` once per transaction and then again for `paymentMethodInfo.method` and again for `paymentMethodInfo.name`.
- Files: `processor/src/services/nuvei-payment.service.ts`, `processor/src/services/converters/nuvei-event.converter.ts`
- Cause: Update data is applied as separate service calls instead of one combined update action set.
- Improvement path: Build one update request containing transaction and metadata changes, preserving idempotency and version handling in a single commercetools write.

**DMN success reconciliation performs a Nuvei API read before updating Payment:**
- Problem: Successful authorization/charge DMNs call `getPaymentStatus` synchronously. During Nuvei latency or outage, webhook processing returns `500` and may cause retries even when the signed DMN contains enough data for some safe states.
- Files: `processor/src/services/nuvei-payment.service.ts`, `processor/src/clients/nuvei.client.ts`, `processor/src/routes/nuvei-payment.route.ts`
- Cause: Online status verification is required in the request path for successful financial events.
- Improvement path: Keep online verification for high-risk transitions, but add bounded retry/backoff or queue-style reconciliation where the platform permits it, and make webhook retry behavior explicit in operations docs.

**Currency fraction digit lookup is duplicated:**
- Problem: Amount formatting and parsing use `Intl.NumberFormat` in both `NuveiPaymentService` and `NuveiEventConverter`; only the converter caches results.
- Files: `processor/src/services/nuvei-payment.service.ts`, `processor/src/services/converters/nuvei-event.converter.ts`
- Cause: Amount utilities are local to each module.
- Improvement path: Extract a shared currency amount helper with caching and strict positive/integer validation used by payment creation, operations, confirmation, and DMN conversion.

**Health check may probe a non-health Nuvei URL:**
- Problem: `NuveiClient.isReachable()` sends `HEAD` to the normalized base API URL, not a documented Nuvei health endpoint. Some gateways reject `HEAD` or base-path requests even when transaction endpoints are healthy.
- Files: `processor/src/clients/nuvei.client.ts`, `processor/src/services/nuvei-payment.service.ts`
- Cause: Reachability is implemented as a generic transport probe.
- Improvement path: Use a documented lightweight Nuvei endpoint if available, or report the check as network reachability only and avoid treating unsupported `HEAD` as definitive PSP downtime.

## Fragile Areas

**Payment reconciliation identity model:**
- Files: `processor/src/services/nuvei-payment.service.ts`, `processor/src/services/ct-payment-creation.service.ts`, `processor/src/services/converters/nuvei-event.converter.ts`, `enabler/src/components/card.ts`, `enabler/src/dropin/dropin-embedded.ts`
- Why fragile: The flow uses Nuvei `sessionToken` as initial Payment `interfaceId` and transaction `interactionId`, later uses Nuvei transaction IDs for successful authorization, and uses `merchant_unique_id` as the commercetools Payment ID in widget/DMN callbacks. Multiple identifiers are valid at different lifecycle stages.
- Safe modification: Preserve explicit invariants for session token, transaction ID, cart ID, Payment ID, and merchant unique ID in every new code path; add fixtures before changing any field mapping.
- Test coverage: Unit tests cover many DMN and confirmation paths, but roadmap Phase 2/3 still requires sandbox evidence and canonical correlation decisions.

**Payment operation state machine:**
- Files: `processor/src/services/abstract-payment.service.ts`, `processor/src/services/nuvei-payment.service.ts`, `processor/src/dtos/operations/payment-intents.dto.ts`, `processor/test/unit/services/nuvei-payment.service.test.ts`
- Why fragile: Capture, cancel, refund, and reverse infer the Nuvei related transaction from current commercetools transactions. Partial capture/refund and repeated operations depend on correct prior state but have limited local bounds checks.
- Safe modification: Treat transaction state transitions as a state machine; validate amounts and currencies against existing successful/pending transactions before calling Nuvei.
- Test coverage: Unit tests exist for service behavior, but manual scenarios list partial capture, partial refund, reverse, and operation reconciliation as external evidence requirements.

**Browser callback handling:**
- Files: `enabler/src/services/api-service.ts`, `enabler/src/components/card.ts`, `enabler/src/dropin/dropin-embedded.ts`, `enabler/src/services/nuvei-sdk.ts`
- Why fragile: The enabler treats only `transactionStatus === "APPROVED"` as confirmable and routes all other statuses to `onError`. It does not model pending, inconclusive, 3DS abandonment, delayed confirmation, or duplicate callbacks as first-class outcomes.
- Safe modification: Extend `PaymentResult` and public callbacks deliberately; keep backward compatibility for `onComplete`/`onError` while adding a safe pending/retry outcome.
- Test coverage: Enabler unit tests cover builder, SDK, API service, and component basics; manual scenarios still require 3DS, decline, pending/outage, and custom storefront evidence.

**Route-level error contracts:**
- Files: `processor/src/routes/nuvei-payment.route.ts`, `processor/src/routes/operation.route.ts`, `processor/src/libs/fastify/error-handler.ts`, `processor/src/dtos/operations/payment-errors.dto.ts`
- Why fragile: Payment setup errors have safe public DTOs, generic Fastify errors go through the SDK error model, confirm-payment returns an outcome without a public error code, and DMN returns minimal ad hoc JSON. Callers must handle several error shapes.
- Safe modification: Define stable error DTOs per public route group and ensure `schema.response` includes expected non-2xx shapes where the route handles errors itself.
- Test coverage: Route tests exist for payment setup and DMN cases, but CI does not run them.

**Generated browser asset output path:**
- Files: `enabler/vite.config.ts`, `enabler/package.json`, `.gitignore`, `connect.yaml`
- Why fragile: The enabler build writes deployable assets into `enabler/public`, while `.gitignore` ignores `public/`. Connect deployments depend on building assets in the expected location before packaging.
- Safe modification: Keep build and deployment docs aligned with `enabler/vite.config.ts`; do not commit generated assets unless the deployment model changes.
- Test coverage: CI validates the Connect descriptor but does not run `npm run build --prefix enabler` to prove assets are generated.

## Scaling Limits

**No asynchronous reconciliation queue:**
- Current capacity: DMN and confirmation requests perform all Nuvei and commercetools work synchronously within the HTTP request.
- Limit: Nuvei latency, commercetools write contention, or webhook retry bursts can tie up request capacity and return `500` for work that might succeed after retry.
- Scaling path: Add durable reconciliation work items or platform-supported retry handling, keep the HTTP route idempotent, and make duplicate/out-of-order handling deterministic.

**No per-cart payment creation throttle or idempotency key:**
- Current capacity: Each browser or Checkout retry can create another Nuvei order and commercetools Payment.
- Limit: Shopper refreshes, retries, or scripted calls can create unbounded pending payment state for a cart.
- Scaling path: Store an idempotency key tied to cart/session/payment method and reuse, cancel, or expire previous pending payments before creating more external state.

**No configured test coverage threshold:**
- Current capacity: Tests can be run manually per package, and coverage can be generated with Vitest.
- Limit: CI and package config do not enforce minimum coverage or branch coverage for reconciliation-critical code.
- Scaling path: Add thresholds after stabilizing fixtures for DMN, operations, browser callbacks, and route error contracts.

## Dependencies at Risk

**CI validates Connect descriptor but not builds/tests:**
- Risk: `.github/workflows/connect-validate.yml` installs `enabler` and `processor` dependencies and runs `commercetools connect validate .`, but it does not run `npm run test`, `npm run build`, or coverage for either package.
- Impact: Type errors, failing unit tests, broken enabler bundles, route regressions, and package script drift can merge while Connect descriptor validation still passes.
- Migration plan: Add package-specific CI steps for `npm run test --prefix processor`, `npm run build --prefix processor`, `npm run test --prefix enabler`, and `npm run build --prefix enabler`, matching `docs/TESTING.md` and `docs/TEST_SCENARIOS.md`.

**External Nuvei SDK SRI pin:**
- Risk: `enabler/src/services/nuvei-sdk.ts` pins the SafeCharge SDK URL and a fixed `sha384` integrity hash. A Nuvei CDN update at the same URL breaks script loading until the hash is updated.
- Impact: All browser payment components fail to mount when the CDN script changes without a corresponding repo update.
- Migration plan: Document the update process, monitor SDK load failures, and consider versioned Nuvei SDK URLs if Nuvei provides them.

**Testing harness has its own dependency island:**
- Risk: `testing/package.json` installs Express for the local mock server, but the CI workflow does not install or run the harness, and docs treat it as manual validation support.
- Impact: Mock behavior can drift from processor/enabler contracts and Postman/browser manual tests can become unreliable without automated feedback.
- Migration plan: Add a lightweight harness smoke test or contract check once Phase 6 fixtures are established.

## Missing Critical Features

**Real sandbox evidence is not encoded as executable fixtures:**
- Problem: The roadmap requires Nuvei sandbox evidence for card, 3DS, declines, capture, cancel, refund, duplicates, and mismatch behavior. Current tests use unit fixtures and a local mock, while external sandbox observations remain manual.
- Blocks: Confident canonical field mapping for every DMN and operation path, especially for edge states and payment methods beyond card.

**No first-class pending/inconclusive shopper outcome:**
- Problem: Browser confirmation and processor confirmation model approved versus rejected/error, not delayed PSP states or uncertain reconciliation.
- Blocks: Safe shopper UX for 3DS abandonment, Nuvei timeout, delayed DMN, and transient status lookup failures.

**No bounded operation validation for partial capture/refund:**
- Problem: Partial captures and refunds are listed as manual scenarios, but the processor does not locally enforce remaining authorized/captured/refundable totals.
- Blocks: Reliable payment-intent operation support in production without relying on Nuvei rejection as the primary guardrail.

**No secret scanning or automated security gate:**
- Problem: Env files exist locally and logs/docs/tests handle payment identifiers. CI does not include secret scanning, linting, build, or test gates.
- Blocks: Higher-confidence release readiness for a payment connector handling credentials and transaction identifiers.

## Test Coverage Gaps

**CI coverage for existing tests:**
- What's not tested: CI does not execute any Vitest suite or TypeScript build despite tests existing in both packages.
- Files: `.github/workflows/connect-validate.yml`, `processor/vitest.config.ts`, `enabler/vitest.config.ts`, `docs/TESTING.md`
- Risk: Regressions in payment setup, DMN reconciliation, Nuvei client signing, and browser builders are only caught when developers run tests manually.
- Priority: High

**Payment-intent schema edge cases:**
- What's not tested: Empty `actions`, non-positive amounts, wrong currency operations, over-capture, over-refund, and repeated reverse/cancel/refund sequences.
- Files: `processor/src/dtos/operations/payment-intents.dto.ts`, `processor/src/services/abstract-payment.service.ts`, `processor/src/services/nuvei-payment.service.ts`, `processor/test/unit/services/nuvei-payment.service.test.ts`, `processor/test/unit/routes/operation.route.test.ts`
- Risk: Invalid operation requests can reach Nuvei, fail generically, or mutate payment state inconsistently.
- Priority: High

**Concurrent duplicate DMNs:**
- What's not tested: Two identical DMNs processed at the same time before either update writes the transaction ID.
- Files: `processor/src/services/nuvei-payment.service.ts`, `processor/test/unit/services/dmn-processing.service.test.ts`, `processor/test/unit/routes/dmn-webhook.route.test.ts`
- Risk: Race conditions can create duplicate transactions even though sequential duplicates are skipped.
- Priority: High

**Nuvei transport failure shapes:**
- What's not tested: Non-JSON Nuvei responses, empty responses, gateway HTML, aborted fetches, and network errors across openOrder, getPaymentStatus, settle, void, refund, and health checks.
- Files: `processor/src/clients/nuvei.client.ts`, `processor/test/unit/clients/nuvei.client.test.ts`, `processor/src/services/nuvei-payment.service.ts`
- Risk: Operators receive generic failures without enough safe diagnostics, and route behavior can vary by upstream error shape.
- Priority: Medium

**Browser pending and 3DS behavior:**
- What's not tested: Pending/inconclusive Nuvei widget results, duplicate `onResult` callbacks, 3DS challenge success/failure/abandonment, and SDK load recovery after an initial failed script.
- Files: `enabler/src/services/api-service.ts`, `enabler/src/components/card.ts`, `enabler/src/dropin/dropin-embedded.ts`, `enabler/src/services/nuvei-sdk.ts`, `enabler/test/unit/card.test.ts`, `enabler/test/unit/dropin.test.ts`, `enabler/test/unit/nuvei-sdk.test.ts`
- Risk: Shopper-facing flows can report hard errors for recoverable states or leave hosts without a clear next action.
- Priority: High

**Manual local harness parity:**
- What's not tested: Automated parity between `testing/mock-commercetools-server.mjs` endpoints and the processor/enabler contracts they mock.
- Files: `testing/mock-commercetools-server.mjs`, `testing/nuvei-local-mock-ct-test.html`, `testing/postman-nuvei-connector-local-testing.collection.json`, `processor/src/routes/nuvei-payment.route.ts`, `enabler/src/services/api-service.ts`
- Risk: Manual testing can pass against a mock behavior that no longer matches the real processor.
- Priority: Medium

---

*Concerns audit: 2026-06-02*
