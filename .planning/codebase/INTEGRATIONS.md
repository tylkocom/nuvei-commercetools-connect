# External Integrations

**Analysis Date:** 2026-06-02

## APIs & External Services

**Payment Service Provider:**
- Nuvei REST API - Server-side payment session creation, status checks, capture, void, and refund operations.
  - SDK/Client: Custom `NuveiClient` in `processor/src/clients/nuvei.client.ts`; no Nuvei npm SDK is used.
  - Auth: `NUVEI_MERCHANT_ID`, `NUVEI_MERCHANT_SITE_ID`, and `NUVEI_SECRET_KEY` from `processor/src/config/config.ts` and `connect.yaml`.
  - Base URL: `NUVEI_API_BASE_URL`; `NuveiClient.normalizeBaseUrl()` appends `/api/v1` when absent and requires HTTPS.
  - Endpoints called: `openOrder.do`, `getPaymentStatus.do`, `settleTransaction.do`, `voidTransaction.do`, and `refundTransaction.do` in `processor/src/clients/nuvei.client.ts`.
  - Signing: SHA-256 checksums built in `NuveiClient.sendSignedRequest()` and `NuveiClient.calculateChecksum()` in `processor/src/clients/nuvei.client.ts`.

**Browser Payment SDK:**
- Nuvei SafeCharge Web SDK - Browser-side widget rendering for the card component and embedded drop-in.
  - SDK/Client: Remote script `https://cdn.safecharge.com/safecharge_resources/v1/websdk/safecharge.js` loaded by `enabler/src/services/nuvei-sdk.ts`.
  - Auth/config: Frontend receives `merchantId`, `merchantSiteId`, and `environment` through `GET /config` in `processor/src/routes/operation.route.ts` and `NuveiPaymentService.config()` in `processor/src/services/nuvei-payment.service.ts`.
  - Integrity: `NUVEI_SDK_INTEGRITY` is set in `enabler/src/services/nuvei-sdk.ts`; script loading uses `crossOrigin = "anonymous"` and `referrerPolicy = "no-referrer"`.
  - Usage: `CardComponent` in `enabler/src/components/card.ts` and `DropinEmbeddedBuilder` in `enabler/src/dropin/dropin-embedded.ts` call `SafeCharge(...).createPayment(...)`.

**commercetools APIs:**
- commercetools Composable Commerce API - Cart, Payment, Order, permission, OAuth token introspection, and Checkout payment operation flows.
  - SDK/Client: `@commercetools/connect-payments-sdk`, `@commercetools/platform-sdk`, and `@commercetools/sdk-client-v2` from `processor/package.json`.
  - Setup: `setupPaymentSDK()` in `processor/src/payment-sdk.ts` wires API URL, Auth URL, project key, client credentials, Session API URL, Checkout API URL, JWKS URL, and JWT issuer.
  - Auth: `CTP_CLIENT_ID` and `CTP_CLIENT_SECRET` secured configuration in `connect.yaml`; `CTP_PROJECT_KEY`, `CTP_AUTH_URL`, `CTP_API_URL`, `CTP_SESSION_URL`, `CTP_CHECKOUT_URL`, `CTP_JWKS_URL`, and `CTP_JWT_ISSUER` standard configuration in `connect.yaml`.
  - Data operations: `CtPaymentCreationService` creates commercetools Payments and attaches them to carts in `processor/src/services/ct-payment-creation.service.ts`; `NuveiPaymentService` reads carts/payments/orders and updates Payment transactions in `processor/src/services/nuvei-payment.service.ts`.
  - Permission checks: `healthCheckCommercetoolsPermissions()` checks required permissions in `NuveiPaymentService.status()` in `processor/src/services/nuvei-payment.service.ts`.

**Internal Processor API consumed by Enabler:**
- Processor Fastify API - Browser enabler calls the deployed processor to create and confirm payment sessions.
  - SDK/Client: Thin fetch wrapper `apiService()` in `enabler/src/services/api-service.ts`.
  - Auth: `X-Session-ID` header containing commercetools Checkout session ID in `enabler/src/services/api-service.ts`; authenticated by `paymentSDK.sessionHeaderAuthHookFn` in `processor/src/server/plugins/nuvei-payment.plugin.ts`.
  - Endpoints called: `POST /payments`, `GET /payments`, and `POST /payments/confirmPayments/:paymentReference` in `enabler/src/services/api-service.ts`.

**Local Testing Services:**
- Local Express mock server - Manual/local harness for connector flows without live commercetools dependencies.
  - SDK/Client: Express server in `testing/mock-commercetools-server.mjs`.
  - Auth: Not a production auth provider; endpoints are local test doubles.
  - Endpoints: `/ledger`, `/config`, `/payment-components`, `/payments`, `/payments/confirmPayments/payment-local-001`, `/webhooks/nuvei`, and `/payment-intents/payment-local-001` in `testing/mock-commercetools-server.mjs`.

## Data Storage

**Databases:**
- No repository-managed database detected.
  - Connection: Not detected.
  - Client: Not detected.
- commercetools is the external system of record for carts, payments, orders, and payment transactions.
  - Connection: `CTP_API_URL`, `CTP_AUTH_URL`, `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, and `CTP_CLIENT_SECRET` in `processor/src/config/config.ts` and `connect.yaml`.
  - Client: `paymentSDK.ctCartService`, `paymentSDK.ctPaymentService`, `paymentSDK.ctOrderService`, and `paymentSDK.ctAuthorizationService` from `processor/src/payment-sdk.ts`.

**File Storage:**
- Local filesystem build outputs only: `processor/dist` from `processor/tsconfig.json` and `enabler/public` from `enabler/vite.config.ts`.
- No S3, GCS, Azure Blob, or other file storage integration detected.

**Caching:**
- No external cache detected.
- In-process singleton/cache usage only: `_nuveiClient` singleton in `processor/src/clients/nuvei.client.ts`, SafeCharge `sdkLoadPromise` in `enabler/src/services/nuvei-sdk.ts`, and `currencyFractionDigitsCache` in `processor/src/services/converters/nuvei-event.converter.ts`.

## Authentication & Identity

**Auth Provider:**
- commercetools Connect Payments SDK authentication hooks - Primary processor API authentication.
  - Implementation: `paymentSDK.sessionHeaderAuthHookFn`, `paymentSDK.jwtAuthHookFn`, `paymentSDK.oauth2AuthHookFn`, and `paymentSDK.authorityAuthorizationHookFn` configured in `processor/src/payment-sdk.ts` and applied in `processor/src/server/plugins/*.ts` and `processor/src/routes/*.ts`.
  - Session auth: `GET /config`, `GET /payments`, `POST /payments`, and `POST /payments/confirmPayments/:id` use commercetools session header authentication in `processor/src/routes/operation.route.ts` and `processor/src/routes/nuvei-payment.route.ts`.
  - JWT auth: `GET /status` and `GET /payment-components` use JWT authentication in `processor/src/routes/operation.route.ts`.
  - OAuth2 + authorization: `POST /payment-intents/:id` requires OAuth2 plus `manage_project` and `manage_checkout_payment_intents`; `POST /transactions` requires OAuth2 plus `manage_project` and `manage_checkout_transactions` in `processor/src/routes/operation.route.ts`.
- Nuvei DMN checksum validation - Webhook authentication/verification.
  - Implementation: `NuveiHeaderAuthHook` requires `advanceResponseChecksum` presence in `processor/src/libs/fastify/hooks/nuvei-header-auth.hook.ts`; cryptographic validation is performed by `NuveiClient.validateDmnChecksum()` in `processor/src/clients/nuvei.client.ts` and `NuveiPaymentService.processNuveiDmn()` in `processor/src/services/nuvei-payment.service.ts`.

## Monitoring & Observability

**Error Tracking:**
- None detected. No Sentry, Datadog, New Relic, Honeycomb, OpenTelemetry, or similar dependency/config appears in `processor/package.json`, `enabler/package.json`, or `docs/DEPLOYMENT.md`.

**Logs:**
- Processor Fastify logging is enabled in `processor/src/server/server.ts` with `LOGGER_LEVEL` from `processor/src/config/config.ts`.
- Application structured JSON logs are written by `processor/src/libs/logger/index.ts` to stdout/stderr with `projectKey`, package metadata, `correlationId`, route path, path template, and optional metadata.
- commercetools Connect Payments SDK logging is adapted by `AppLogger` in `processor/src/payment-sdk.ts`.
- Dependency status is exposed by authenticated `GET /status` in `processor/src/routes/operation.route.ts`; `NuveiPaymentService.status()` checks commercetools permissions and Nuvei API reachability in `processor/src/services/nuvei-payment.service.ts`.

## CI/CD & Deployment

**Hosting:**
- commercetools Connect is the deployment target declared in `connect.yaml`.
- `enabler` deploys as an `assets` application in `connect.yaml`.
- `processor` deploys as a `service` application with endpoint `/` in `connect.yaml`.
- No Dockerfile, Docker Compose, Vercel, Netlify, Fly.io, Railway, or Serverless Framework deployment config detected; `docs/DEPLOYMENT.md` identifies `connect.yaml` as the runtime deployment descriptor.

**CI Pipeline:**
- GitHub Actions workflow `.github/workflows/connect-validate.yml` validates the Connect app on pull requests, pushes to `main`, and manual dispatch.
- CI installs dependencies with `npm ci --prefix enabler` and `npm ci --prefix processor`, installs `@commercetools/cli@0.0.17`, then runs `commercetools connect validate .`.
- No checked-in CI deployment job detected; `docs/DEPLOYMENT.md` states the workflow validates but does not publish or deploy the connector.

## Environment Configuration

**Required env vars:**
- commercetools standard configuration: `CTP_PROJECT_KEY`, `CTP_AUTH_URL`, `CTP_API_URL`, `CTP_SESSION_URL`, `CTP_JWKS_URL`, `CTP_JWT_ISSUER`, and `CTP_CHECKOUT_URL` in `connect.yaml` and `processor/src/config/config.ts`.
- commercetools secured configuration: `CTP_CLIENT_ID` and `CTP_CLIENT_SECRET` in `connect.yaml` and `processor/src/config/config.ts`.
- Nuvei standard configuration: `NUVEI_ENV`, `NUVEI_MERCHANT_ID`, `NUVEI_MERCHANT_SITE_ID`, and `NUVEI_API_BASE_URL` in `connect.yaml` and `processor/src/config/config.ts`.
- Nuvei secured configuration: `NUVEI_SECRET_KEY` in `connect.yaml` and `processor/src/config/config.ts`.
- Runtime validation in `processor/src/config/config.ts` rejects missing required values, fallback `xxx` client credentials, non-HTTPS external URLs, and non-`sha256` `NUVEI_DMN_CHECKSUM_ALGORITHM`.

**Optional env vars:**
- `NUVEI_DMN_CHECKSUM_ALGORITHM` - Optional in `connect.yaml`; only `sha256` is accepted by `processor/src/config/config.ts`.
- `CORS_ALLOWED_ORIGINS` - Additional HTTPS origins added to the CORS allowlist in `processor/src/server/server.ts`.
- `CONNECT_SERVICE_URL` - Used by `processor/src/connectors/post-deploy.ts` to print the Nuvei DMN URL.
- `RETURN_URL` - Merchant return URL fallback in `processor/src/services/nuvei-payment.service.ts`.
- `PORT`, `HEALTH_CHECK_TIMEOUT`, and `LOGGER_LEVEL` - Processor service settings in `processor/src/config/config.ts`.

**Secrets location:**
- commercetools Connect secured configuration for deployed `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, and `NUVEI_SECRET_KEY` as declared in `connect.yaml`.
- Local dotenv files exist at `.env` and `processor/.env`; treat contents as secret-bearing and do not quote or commit values.

## Webhooks & Callbacks

**Incoming:**
- `POST /webhooks/nuvei` - Nuvei Direct Merchant Notification webhook registered by `nuveiWebhookRoutes` in `processor/src/routes/nuvei-payment.route.ts` and mounted with prefix `/webhooks` in `processor/src/server/plugins/nuvei-payment.plugin.ts`.
  - Raw body support: `fastify-raw-body` is configured for `/webhooks/nuvei` in `processor/src/server/server.ts`.
  - Verification: `NuveiHeaderAuthHook` checks for `advanceResponseChecksum` in `processor/src/libs/fastify/hooks/nuvei-header-auth.hook.ts`; `NuveiClient.validateDmnChecksum()` validates the checksum in `processor/src/clients/nuvei.client.ts`; `NuveiPaymentService.processNuveiDmn()` validates merchant IDs, idempotency, payment identity, amount, currency, cart identity, and transaction identity in `processor/src/services/nuvei-payment.service.ts`.
  - Setup: `processor/src/connectors/post-deploy.ts` prints `${CONNECT_SERVICE_URL}/webhooks/nuvei`; Nuvei dashboard registration remains manual.
- Processor payment operation endpoints are inbound API callbacks from commercetools Checkout and storefront code: `/config`, `/status`, `/payment-components`, `/payment-intents/:id`, `/transactions`, `/payments`, and `/payments/confirmPayments/:id` in `processor/src/routes/*.ts`.

**Outgoing:**
- Nuvei REST calls from `processor/src/clients/nuvei.client.ts` to `NUVEI_API_BASE_URL` for `openOrder`, `getPaymentStatus`, `settleTransaction`, `voidTransaction`, and `refundTransaction`.
- commercetools API calls from services created in `processor/src/payment-sdk.ts`, used by `processor/src/services/ct-payment-creation.service.ts` and `processor/src/services/nuvei-payment.service.ts`.
- Browser script load from `enabler/src/services/nuvei-sdk.ts` to the Nuvei SafeCharge CDN URL.
- No outgoing webhook registration/removal API is implemented; `processor/src/connectors/post-deploy.ts` and `processor/src/connectors/pre-undeploy.ts` print operator instructions for manual Nuvei dashboard changes.

---

*Integration audit: 2026-06-02*
