# Architecture

**Analysis Date:** 2026-06-02

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│              Browser / commercetools Checkout               │
│       `enabler/src/index.ts`, `enabler/src/main.ts`          │
├──────────────────────────┬──────────────────────────────────┤
│  Card component flow      │  Embedded drop-in flow           │
│  `enabler/src/components/card.ts`                            │
│  `enabler/src/dropin/dropin-embedded.ts`                     │
└──────────────┬───────────┴───────────────┬──────────────────┘
               │                           │
               ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│      Browser effect adapters: Nuvei SDK + processor fetch    │
│      `enabler/src/services/nuvei-sdk.ts`                     │
│      `enabler/src/services/api-service.ts`                   │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP + `X-Session-ID`
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 Fastify processor service                    │
│                 `processor/src/server/server.ts`             │
├──────────────────────────┬──────────────────────────────────┤
│  Operations routes        │  Nuvei payment/webhook routes    │
│  `processor/src/routes/operation.route.ts`                   │
│  `processor/src/routes/nuvei-payment.route.ts`               │
└──────────────┬───────────┴───────────────┬──────────────────┘
               │                           │
               ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│                Payment orchestration layer                   │
│                `processor/src/services/nuvei-payment.service.ts` │
│                `processor/src/services/abstract-payment.service.ts` │
└──────────────┬───────────────────────────┬──────────────────┘
               │                           │
               ▼                           ▼
┌─────────────────────────────┐   ┌───────────────────────────┐
│ commercetools Connect SDK   │   │ Nuvei REST API             │
│ `processor/src/payment-sdk.ts` │ │ `processor/src/clients/nuvei.client.ts` │
└─────────────────────────────┘   └───────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Connect descriptor | Declares the two commercetools Connect applications, deployment type, service endpoint, lifecycle scripts, standard configuration, and secured configuration. | `connect.yaml` |
| Enabler package entry | Exports `NuveiEnabler`, public contracts, card builder, and embedded drop-in builder for browser consumers. | `enabler/src/index.ts` |
| Vite library entry | Exposes the Connect assets bundle entry as `Enabler` for generated ES and UMD files. | `enabler/src/main.ts` |
| Payment enabler contracts | Defines frontend interfaces, runtime option validation, public payment errors, component/drop-in contracts, and `DropinType`. | `enabler/src/payment-enabler/payment-enabler.ts` |
| Enabler method registry | Defines supported browser-side payment methods: `card` as a component and `embedded` as a drop-in. | `enabler/src/payment-enabler/method-registry.ts` |
| Card component | Creates a processor payment session, loads the SafeCharge SDK, renders a card widget, and confirms approved results. | `enabler/src/components/card.ts` |
| Embedded drop-in | Creates a processor payment session, loads the SafeCharge SDK, renders the embedded widget, and confirms approved results. | `enabler/src/dropin/dropin-embedded.ts` |
| Browser API client | Wraps `fetch` calls to `POST /payments`, `GET /payments`, and `POST /payments/confirmPayments/:id`; normalizes public payment errors. | `enabler/src/services/api-service.ts` |
| Nuvei SDK loader | Loads the Nuvei SafeCharge script once with SRI and shares the resulting `window.SafeCharge` factory. | `enabler/src/services/nuvei-sdk.ts` |
| Processor bootstrap | Loads `.env`, validates runtime configuration, builds Fastify, and listens on `0.0.0.0`. | `processor/src/index.ts` |
| Fastify setup | Creates the Fastify instance, security headers, CORS policy, raw body support for DMNs, form-body parsing, request context, plugin autoloading, and error handling. | `processor/src/server/server.ts` |
| App singleton | Instantiates the Nuvei payment service with commercetools SDK services. | `processor/src/server/app.ts` |
| Operations plugin | Registers `/config`, `/status`, `/payment-components`, `/payment-intents/:id`, and `/transactions`. | `processor/src/server/plugins/operation.plugin.ts` |
| Nuvei payment plugin | Registers `/payments/*` session routes and `/webhooks/nuvei` DMN route. | `processor/src/server/plugins/nuvei-payment.plugin.ts` |
| Operations routes | Maps Connect operation endpoints to payment service methods with JWT, OAuth2, session, and authority hooks. | `processor/src/routes/operation.route.ts` |
| Payment and webhook routes | Maps payment session creation, widget confirmation, and Nuvei DMN webhook handling to `NuveiPaymentService`. | `processor/src/routes/nuvei-payment.route.ts` |
| Payment SDK adapter | Configures commercetools Connect Payments SDK, auth hooks, context propagation, and logger adapter. | `processor/src/payment-sdk.ts` |
| Request context | Stores correlation ID, request ID, route metadata, and commercetools authentication data per Fastify request. | `processor/src/libs/fastify/context/context.ts` |
| Global error handler | Converts Fastify validation errors and Connect SDK errors into HTTP error responses. | `processor/src/libs/fastify/error-handler.ts` |
| DMN pre-filter hook | Requires a Nuvei DMN checksum field before route processing; cryptographic validation remains in the service. | `processor/src/libs/fastify/hooks/nuvei-header-auth.hook.ts` |
| Abstract payment service | Defines Connect payment operation contracts and shared `modifyPayment()` dispatch behavior. | `processor/src/services/abstract-payment.service.ts` |
| Nuvei payment service | Owns the core business flow: config/status, payment session creation, payment modifications, transaction creation, widget confirmation, and DMN reconciliation. | `processor/src/services/nuvei-payment.service.ts` |
| commercetools payment creation service | Creates commercetools Payments and attaches them to carts. | `processor/src/services/ct-payment-creation.service.ts` |
| Nuvei REST client | Signs Nuvei requests, normalizes Nuvei base URLs, sends API calls, validates DMN checksums, and exposes Nuvei transaction operations. | `processor/src/clients/nuvei.client.ts` |
| DMN event converter | Converts Nuvei DMN body fields to commercetools transaction update data and card metadata. | `processor/src/services/converters/nuvei-event.converter.ts` |
| Transaction converter | Maps Nuvei transaction/status values into commercetools transaction types, states, and status interface codes. | `processor/src/services/payment-converter.ts` |
| Runtime config | Reads environment variables, applies defaults, and validates required values and HTTPS URL boundaries. | `processor/src/config/config.ts` |
| Local testing harness | Provides an Express mock server, Postman collection, environment file, and browser test page for local connector flows. | `testing/mock-commercetools-server.mjs`, `testing/postman-nuvei-connector-local-testing.collection.json`, `testing/nuvei-local-mock-ct-test.html` |

## Pattern Overview

**Overall:** Two-application commercetools Connect payment connector with a browser assets adapter and a Fastify service adapter.

**Key Characteristics:**
- Keep browser UI integration in `enabler/src/**`; it must depend on browser APIs, the Nuvei SafeCharge script, and processor HTTP contracts only.
- Keep server-side payment behavior in `processor/src/services/**`; routes in `processor/src/routes/**` must stay thin and delegate business decisions to services.
- Use `processor/src/payment-sdk.ts` as the sole commercetools Connect Payments SDK wiring point; request-scoped authentication and correlation data flow through `processor/src/libs/fastify/context/context.ts`.
- Use `processor/src/clients/nuvei.client.ts` as the sole Nuvei server API adapter; request signing, endpoint suffixes, base URL normalization, timeouts, and checksum comparison belong there.
- Use TypeBox schemas in `processor/src/dtos/**` at HTTP boundaries; service methods should operate on validated DTOs or platform SDK objects.

## Layers

**Connect deployment layer:**
- Purpose: Describe deployable Connect applications and runtime configuration keys.
- Location: `connect.yaml`
- Contains: `enabler` assets app, `processor` service app, endpoint `/`, lifecycle scripts, required commercetools/Nuvei configuration.
- Depends on: commercetools Connect packaging conventions.
- Used by: commercetools Connect deployment and `.github/workflows/connect-validate.yml`.

**Browser public API layer:**
- Purpose: Expose the consumer-facing payment enabler API and supported method metadata.
- Location: `enabler/src/index.ts`, `enabler/src/main.ts`, `enabler/src/payment-enabler/payment-enabler.ts`, `enabler/src/payment-enabler/method-registry.ts`
- Contains: `NuveiEnabler`, builder interfaces, component/drop-in interfaces, `PaymentMethod`, `DropinType`, runtime option validation, public error types.
- Depends on: component builders in `enabler/src/components/card.ts` and `enabler/src/dropin/dropin-embedded.ts`.
- Used by: consuming storefront/Checkout pages and the Vite library build configured in `enabler/vite.config.ts`.

**Browser component layer:**
- Purpose: Render Nuvei payment UI and translate widget callbacks into processor confirmation requests.
- Location: `enabler/src/components/card.ts`, `enabler/src/dropin/dropin-embedded.ts`
- Contains: `CardComponentBuilder`, `CardComponent`, `DropinEmbeddedBuilder`, embedded drop-in component implementation.
- Depends on: `enabler/src/services/nuvei-sdk.ts`, `enabler/src/services/api-service.ts`, and frontend contracts in `enabler/src/payment-enabler/payment-enabler.ts`.
- Used by: `NuveiEnabler.createComponentBuilder()` and `NuveiEnabler.createDropinBuilder()` in `enabler/src/index.ts`.

**Browser effect adapter layer:**
- Purpose: Isolate external browser effects from component orchestration.
- Location: `enabler/src/services/api-service.ts`, `enabler/src/services/nuvei-sdk.ts`
- Contains: processor fetch calls, public error response parsing, payment confirmation helper, SafeCharge script loading and SRI policy.
- Depends on: browser `fetch`, `document`, `window.SafeCharge`, and frontend payment result types.
- Used by: `enabler/src/components/card.ts` and `enabler/src/dropin/dropin-embedded.ts`.

**Processor bootstrap/infrastructure layer:**
- Purpose: Build the HTTP server and shared request infrastructure.
- Location: `processor/src/index.ts`, `processor/src/server/server.ts`, `processor/src/server/app.ts`, `processor/src/server/plugins/**`, `processor/src/libs/fastify/**`
- Contains: Fastify setup, CORS, security headers, raw DMN body support, request context, plugin registration, global error handling, app-level service singleton.
- Depends on: `processor/src/config/config.ts`, `processor/src/payment-sdk.ts`, route modules, and Fastify plugins.
- Used by: `npm run dev --prefix processor` and `npm start --prefix processor`.

**Processor HTTP route layer:**
- Purpose: Define HTTP contracts, authentication hooks, validation schemas, response status codes, and route-to-service mapping.
- Location: `processor/src/routes/operation.route.ts`, `processor/src/routes/nuvei-payment.route.ts`, `processor/src/dtos/**`
- Contains: `/config`, `/status`, `/payment-components`, `/payment-intents/:id`, `/transactions`, `/payments`, `/payments/confirmPayments/:id`, `/webhooks/nuvei`.
- Depends on: auth hooks from `processor/src/payment-sdk.ts`, `NuveiHeaderAuthHook`, TypeBox schemas, and service methods.
- Used by: Fastify plugins in `processor/src/server/plugins/**`.

**Processor orchestration layer:**
- Purpose: Own payment business rules independent of Fastify syntax.
- Location: `processor/src/services/nuvei-payment.service.ts`, `processor/src/services/abstract-payment.service.ts`, `processor/src/services/ct-payment-creation.service.ts`
- Contains: payment session creation, method-option validation, transaction creation, capture/cancel/refund/reverse operations, widget confirmation, DMN idempotency and reconciliation, commercetools Payment creation.
- Depends on: commercetools SDK services, `processor/src/clients/nuvei.client.ts`, request context helpers, DTO enums, and converter services.
- Used by: all processor routes.

**External client/converter layer:**
- Purpose: Centralize vendor-specific API/protocol mapping.
- Location: `processor/src/clients/nuvei.client.ts`, `processor/src/services/converters/nuvei-event.converter.ts`, `processor/src/services/payment-converter.ts`
- Contains: Nuvei signed requests, payment status calls, transaction calls, checksum validation, DMN parsing, Nuvei-to-commercetools transaction mapping.
- Depends on: Node `crypto`, global `fetch`, commercetools platform types, and runtime configuration.
- Used by: `processor/src/services/nuvei-payment.service.ts`.

**Configuration layer:**
- Purpose: Normalize runtime configuration and reject unsafe/missing values before the processor starts.
- Location: `processor/src/config/config.ts`
- Contains: commercetools URLs and credentials, Nuvei merchant/API configuration, CORS origins, logging level, service URL, return URL, port, validation rules.
- Depends on: environment variables loaded by `dotenv` in `processor/src/index.ts`.
- Used by: processor bootstrap, payment SDK setup, Nuvei client factory, payment service, and CORS setup.

## Data Flow

### Browser payment session and widget confirmation

1. A browser consumer imports `NuveiEnabler` from `enabler/src/index.ts` or `Enabler` from the Vite bundle entry `enabler/src/main.ts`.
2. `new NuveiEnabler(opts)` validates `processorUrl`, `sessionId`, merchant identifiers, and environment in `enabler/src/payment-enabler/payment-enabler.ts`.
3. The consumer calls `createComponentBuilder("card")` or `createDropinBuilder("embedded")` on `NuveiEnabler` in `enabler/src/index.ts`.
4. `CardComponent.mount()` in `enabler/src/components/card.ts` or the embedded drop-in in `enabler/src/dropin/dropin-embedded.ts` loads the Nuvei SafeCharge SDK via `loadNuveiSdk()` in `enabler/src/services/nuvei-sdk.ts`.
5. The component calls `apiService.createPayment()` in `enabler/src/services/api-service.ts`, sending `POST /payments` with `X-Session-ID` and method options.
6. `paymentRoutes` in `processor/src/routes/nuvei-payment.route.ts` authenticates the session through `paymentSDK.sessionHeaderAuthHookFn` registered by `processor/src/server/plugins/nuvei-payment.plugin.ts`.
7. `NuveiPaymentService.createPaymentIntent()` in `processor/src/services/nuvei-payment.service.ts` validates method options, reads the cart ID from `processor/src/libs/fastify/context/context.ts`, gets the cart and amount from commercetools SDK services, and opens a Nuvei order with `NuveiClient.openOrder()`.
8. `CtPaymentCreationService.handleCtPaymentCreation()` in `processor/src/services/ct-payment-creation.service.ts` creates a commercetools Payment with an initial `Authorization` transaction and attaches it to the cart.
9. The processor returns `cartId`, Nuvei `sessionToken`, commercetools `paymentReference`, and `merchantReturnUrl` to the browser.
10. The browser component calls `SafeCharge(...).createPayment(...)` with the Nuvei session token and `merchant_unique_id` set to the commercetools payment reference.
11. For approved widget results, `confirmPaymentResult()` in `enabler/src/services/api-service.ts` sends `POST /payments/confirmPayments/:paymentReference` with the Nuvei `sessionToken`.
12. `NuveiPaymentService.confirmPayment()` verifies the Payment belongs to the authenticated session cart, calls `NuveiClient.getPaymentStatus()`, checks amount/currency/cart identity, and updates the commercetools Payment transaction state through the Connect Payments SDK.

### Connect operation flow

1. commercetools calls `GET /config`, `GET /status`, or `GET /payment-components` through `processor/src/routes/operation.route.ts`.
2. `/config` uses session-header authentication and returns frontend Nuvei merchant configuration from `NuveiPaymentService.config()`.
3. `/status` uses JWT authentication and runs commercetools permission checks plus Nuvei reachability in `NuveiPaymentService.status()`.
4. `/payment-components` uses JWT authentication and returns component/drop-in support from the processor-local registry in `processor/src/dtos/operations/payment-components.dto.ts`.
5. `POST /payment-intents/:id` uses OAuth2 authentication plus `manage_project` / `manage_checkout_payment_intents` authority checks in `processor/src/routes/operation.route.ts`.
6. `AbstractPaymentService.modifyPayment()` in `processor/src/services/abstract-payment.service.ts` dispatches capture, cancel, refund, or reverse requests to Nuvei-specific methods in `processor/src/services/nuvei-payment.service.ts`.
7. `capturePayment()`, `cancelPayment()`, and `refundPayment()` call `settleTransaction`, `voidTransaction`, or `refundTransaction` on `NuveiClient` in `processor/src/clients/nuvei.client.ts`.

### Server-driven transaction creation

1. commercetools calls `POST /transactions` in `processor/src/routes/operation.route.ts` with OAuth2 authentication and `manage_project` / `manage_checkout_transactions` authority checks.
2. `NuveiPaymentService.handleTransaction()` in `processor/src/services/nuvei-payment.service.ts` loads the cart, uses the requested amount or cart payment amount, and opens a Nuvei order.
3. `CtPaymentCreationService.handleCtPaymentCreation()` creates and attaches a commercetools Payment.
4. The route returns `201` with a `Pending` transaction status, or `Failed` with a `PaymentRejected` error when transaction creation fails.

### Nuvei DMN webhook reconciliation

1. Nuvei sends `POST /webhooks/nuvei`, registered by `processor/src/server/plugins/nuvei-payment.plugin.ts` and implemented in `processor/src/routes/nuvei-payment.route.ts`.
2. Fastify captures the raw body for `/webhooks/nuvei` in `processor/src/server/server.ts` and parses form bodies through `@fastify/formbody`.
3. `NuveiHeaderAuthHook.authenticate()` in `processor/src/libs/fastify/hooks/nuvei-header-auth.hook.ts` requires `advanceResponseChecksum` to be present.
4. `NuveiPaymentService.processNuveiDmn()` validates the checksum using `NuveiClient.validateDmnChecksum()` and checks merchant identifiers against `processor/src/config/config.ts`.
5. The service reads the commercetools Payment ID from `merchant_unique_id`, loads the Payment, and skips processing when an existing transaction interaction ID already matches the Nuvei transaction ID.
6. `NuveiEventConverter.convertDmnToPaymentUpdate()` in `processor/src/services/converters/nuvei-event.converter.ts` parses DMN fields into transaction update data.
7. Successful authorization/charge DMNs are confirmed through `NuveiClient.getPaymentStatus()` and verified against transaction ID, cart identity, amount, and currency in `NuveiPaymentService`.
8. The service writes each converted transaction to the commercetools Payment and updates optional payment method metadata when present.

**State Management:**
- Browser state is instance-local in `NuveiEnabler`, `CardComponent`, and embedded drop-in component instances under `enabler/src/**`.
- The Nuvei SDK loader caches a module-level `sdkLoadPromise` in `enabler/src/services/nuvei-sdk.ts` so the SafeCharge script is loaded once per page.
- Processor request state is request-scoped through `@fastify/request-context` in `processor/src/libs/fastify/context/context.ts`.
- Processor service singletons live in `processor/src/server/app.ts`; the Nuvei client factory caches `_nuveiClient` in `processor/src/clients/nuvei.client.ts`.
- Durable payment state lives in commercetools Payments/Carts through SDK services configured in `processor/src/payment-sdk.ts`; Nuvei transaction state is queried through `processor/src/clients/nuvei.client.ts`.

## Key Abstractions

**`NuveiEnabler`:**
- Purpose: Public browser entry point for creating payment component/drop-in builders.
- Examples: `enabler/src/index.ts`, `enabler/src/main.ts`
- Pattern: Facade over registry-backed builder factories.

**Payment method registry:**
- Purpose: Declare supported payment UI methods and whether they are components or drop-ins.
- Examples: `enabler/src/payment-enabler/method-registry.ts`, `processor/src/dtos/operations/payment-components.dto.ts`
- Pattern: Immutable registry array with helper filters and type guards; update both enabler and processor copies when adding payment methods.

**Payment component/drop-in contracts:**
- Purpose: Define the frontend shape expected by Checkout/storefront consumers.
- Examples: `enabler/src/payment-enabler/payment-enabler.ts`, `enabler/src/components/card.ts`, `enabler/src/dropin/dropin-embedded.ts`
- Pattern: Builder produces mountable component; component hides Nuvei SDK loading and processor session creation.

**`apiService`:**
- Purpose: Bind processor URL and session ID into a small browser fetch client.
- Examples: `enabler/src/services/api-service.ts`
- Pattern: Closure-based adapter returning typed async operations.

**`loadNuveiSdk`:**
- Purpose: Load SafeCharge once and return a typed factory.
- Examples: `enabler/src/services/nuvei-sdk.ts`
- Pattern: Module-level promise cache plus DOM script injection with SRI.

**`paymentSDK`:**
- Purpose: Configure commercetools SDK services and authentication hooks for the processor.
- Examples: `processor/src/payment-sdk.ts`
- Pattern: Single composition root for SDK setup and request-context bridging.

**`AbstractPaymentService`:**
- Purpose: Define the payment operation interface and shared `modifyPayment()` dispatch for Connect operation routes.
- Examples: `processor/src/services/abstract-payment.service.ts`, `processor/src/services/nuvei-payment.service.ts`
- Pattern: Abstract base class with provider-specific implementations.

**`NuveiPaymentService`:**
- Purpose: Orchestrate all provider behavior for config, status, payment creation, payment modification, confirmation, and DMN processing.
- Examples: `processor/src/services/nuvei-payment.service.ts`
- Pattern: Stateful service object holding helper services; external effects go through injected commercetools services and `nuveiClient()`.

**`CtPaymentCreationService`:**
- Purpose: Encapsulate commercetools Payment creation and cart attachment.
- Examples: `processor/src/services/ct-payment-creation.service.ts`
- Pattern: Focused domain service around commercetools cart/payment writes.

**`NuveiClient`:**
- Purpose: Encapsulate Nuvei HTTP protocol details, signing, checksum validation, and endpoint paths.
- Examples: `processor/src/clients/nuvei.client.ts`
- Pattern: Vendor API client with signed request helpers and a module-level factory.

**DMN converters:**
- Purpose: Keep webhook field parsing and transaction/status mapping separate from route handlers.
- Examples: `processor/src/services/converters/nuvei-event.converter.ts`, `processor/src/services/payment-converter.ts`
- Pattern: Pure mapping functions/classes used by orchestration service.

**TypeBox DTOs:**
- Purpose: Define HTTP body/response validation schemas and DTO types for Fastify routes.
- Examples: `processor/src/dtos/nuvei-payment.dto.ts`, `processor/src/dtos/operations/*.dto.ts`
- Pattern: `Type.Object(...)` schema exported with `Static<typeof Schema>` DTO type.

## Entry Points

**Connect deployment descriptor:**
- Location: `connect.yaml`
- Triggers: commercetools Connect deployment and validation.
- Responsibilities: Declare the `enabler` assets app, `processor` service app, endpoint `/`, post-deploy/pre-undeploy scripts, and required configuration keys.

**Processor runtime:**
- Location: `processor/src/index.ts`
- Triggers: `npm run dev --prefix processor` through `tsx`, or `npm start --prefix processor` after build.
- Responsibilities: Load environment variables, validate config, call `setupFastify()`, and listen on the configured port.

**Fastify server setup:**
- Location: `processor/src/server/server.ts`
- Triggers: Called by `processor/src/index.ts`.
- Responsibilities: Build Fastify instance, register infrastructure plugins, autoload route plugins from `processor/src/server/plugins/`, and return the server.

**Operations plugin:**
- Location: `processor/src/server/plugins/operation.plugin.ts`
- Triggers: Fastify autoload in `processor/src/server/server.ts`.
- Responsibilities: Register operations routes with `paymentSDK` auth hooks and `app.services.paymentService`.

**Nuvei payment plugin:**
- Location: `processor/src/server/plugins/nuvei-payment.plugin.ts`
- Triggers: Fastify autoload in `processor/src/server/server.ts`.
- Responsibilities: Register `/payments` session routes and `/webhooks/nuvei` webhook routes.

**Browser library entry:**
- Location: `enabler/src/main.ts`
- Triggers: Vite library build configured in `enabler/vite.config.ts`.
- Responsibilities: Export `NuveiEnabler` as `Enabler` for generated `enabler/public/connector-enabler.es.js` and `enabler/public/connector-enabler.umd.js`.

**Browser package API:**
- Location: `enabler/src/index.ts`
- Triggers: TypeScript imports from custom storefront/Checkout code.
- Responsibilities: Export public contracts and instantiate builders for supported payment methods.

**Connect lifecycle scripts:**
- Location: `processor/src/connectors/post-deploy.ts`, `processor/src/connectors/pre-undeploy.ts`
- Triggers: `connector:post-deploy` and `connector:pre-undeploy` scripts configured in `processor/package.json` and `connect.yaml`.
- Responsibilities: Run connector lifecycle behavior after deploy and before undeploy.

**Local test harness:**
- Location: `testing/mock-commercetools-server.mjs`
- Triggers: `npm start --prefix testing`.
- Responsibilities: Serve mocked commercetools/processor-compatible endpoints for local manual testing assets in `testing/`.

## Architectural Constraints

- **Threading:** The processor uses the Node.js single-threaded event loop. `processor/src/clients/nuvei.client.ts` uses async `fetch` and `AbortController` timeouts; no worker threads are present.
- **Global state:** `processor/src/server/app.ts` holds a singleton `NuveiPaymentService`; `processor/src/clients/nuvei.client.ts` holds a cached `_nuveiClient`; `enabler/src/services/nuvei-sdk.ts` holds a cached `sdkLoadPromise`.
- **Request context:** Use `processor/src/libs/fastify/context/context.ts` for per-request authentication, cart, correlation ID, and request ID access. Do not pass session-derived cart IDs through global variables.
- **HTTP validation:** Use TypeBox schemas from `processor/src/dtos/**` for route request and response validation. Do not put schema definitions inline in services.
- **Auth boundaries:** Browser payment session routes require `SessionHeaderAuthenticationHook`; operation mutation routes require OAuth2 plus authority checks; status/components routes require JWT; DMN routes require Nuvei checksum presence and service-level checksum validation.
- **Raw webhook body:** `processor/src/server/server.ts` enables raw-body capture only for `/webhooks/nuvei`; webhook changes must preserve this route path or update raw-body configuration.
- **CORS:** `processor/src/server/server.ts` allows missing `Origin`, configured commercetools Checkout URL, and explicit `CORS_ALLOWED_ORIGINS` only.
- **No root workspace:** There is no root `package.json`; package commands run with `--prefix enabler`, `--prefix processor`, or `--prefix testing`.
- **Generated assets:** `enabler/public/connector-enabler.es.js` and `enabler/public/connector-enabler.umd.js` are build outputs generated from `enabler/src/main.ts` by `enabler/vite.config.ts`.
- **Circular imports:** Not detected in the inspected source. Keep composition roots in `processor/src/server/app.ts`, `processor/src/payment-sdk.ts`, and `enabler/src/index.ts` to avoid introducing route/service/client cycles.

## Anti-Patterns

### Business Logic in Routes

**What happens:** Routes in `processor/src/routes/operation.route.ts` and `processor/src/routes/nuvei-payment.route.ts` are thin and delegate to service methods.
**Why it's wrong:** Adding Nuvei/commercetools business decisions directly to route handlers would duplicate rules across endpoints and make route tests brittle.
**Do this instead:** Put payment behavior in `processor/src/services/nuvei-payment.service.ts`; keep route handlers limited to auth hooks, schema wiring, status codes, and calling a service method.

### Direct Vendor Calls Outside Client Adapters

**What happens:** Nuvei API calls are centralized in `processor/src/clients/nuvei.client.ts`; browser SafeCharge loading is centralized in `enabler/src/services/nuvei-sdk.ts`.
**Why it's wrong:** Calling Nuvei endpoints or injecting SDK scripts from feature code would bypass signing, SRI, timeout, endpoint normalization, and checksum rules.
**Do this instead:** Add server Nuvei endpoints to `processor/src/clients/nuvei.client.ts`; add browser SDK behavior to `enabler/src/services/nuvei-sdk.ts` and call it from components.

### Shared Mutable Request State

**What happens:** Request data is stored per request in `processor/src/libs/fastify/context/context.ts`.
**Why it's wrong:** Storing cart IDs, session credentials, or auth data in module globals would leak data between concurrent requests.
**Do this instead:** Read session and auth data through `getCartIdFromContext()`, `getCtSessionIdFromContext()`, and related helpers in `processor/src/libs/fastify/context/context.ts`.

### Diverging Payment Method Metadata

**What happens:** Supported payment methods are mirrored in `enabler/src/payment-enabler/method-registry.ts` and `processor/src/dtos/operations/payment-components.dto.ts`.
**Why it's wrong:** Updating only one registry makes frontend builders and backend-advertised capabilities disagree.
**Do this instead:** When adding or removing methods, update both registry files and the contract tests under `processor/test/unit/contract/` and enabler unit tests under `enabler/test/unit/`.

## Error Handling

**Strategy:** Validate at HTTP boundaries, convert known errors to public HTTP responses, log internal details server-side, and reject unsafe payment state transitions before updating commercetools Payments.

**Patterns:**
- Fastify validation and Connect SDK errors are normalized in `processor/src/libs/fastify/error-handler.ts`.
- Public payment setup errors use `PaymentSetupError` and `PublicPaymentErrorCode` in `processor/src/dtos/operations/payment-errors.dto.ts` and `enabler/src/payment-enabler/payment-enabler.ts`.
- `POST /payments` catches `PaymentSetupError` in `processor/src/routes/nuvei-payment.route.ts` and returns sanitized `400` or `422` responses.
- `POST /payments/confirmPayments/:id` catches confirmation failures in `processor/src/routes/nuvei-payment.route.ts` and returns a rejected outcome.
- Payment modification methods in `processor/src/services/nuvei-payment.service.ts` log provider failures and return rejected provider modification responses.
- DMN checksum failures throw `DmnChecksumInvalidError` in `processor/src/services/nuvei-payment.service.ts`; the webhook route maps it to HTTP `400` in `processor/src/routes/nuvei-payment.route.ts`.
- Browser confirmation uses `confirmPaymentResult()` in `enabler/src/services/api-service.ts` to call `onComplete({ isSuccess: false })` for rejected outcomes and `onError` for thrown errors.

## Cross-Cutting Concerns

**Logging:** Processor logging goes through the Fastify logger and SDK adapter. `processor/src/payment-sdk.ts` adapts the local logger to the Connect Payments SDK `Logger` interface; service methods use `log` from `processor/src/libs/logger/index.ts` and redact Nuvei session tokens in `NuveiPaymentService.redactToken()`.

**Validation:** Processor route payloads use TypeBox DTOs under `processor/src/dtos/**`. Startup configuration validation lives in `processor/src/config/config.ts`. Frontend enabler option validation lives in `enabler/src/payment-enabler/payment-enabler.ts`. Payment method option validation lives in `NuveiPaymentService.validatePaymentMethodOptions()` in `processor/src/services/nuvei-payment.service.ts`.

**Authentication:** `processor/src/payment-sdk.ts` supplies session, JWT, OAuth2, and authority hooks from `@commercetools/connect-payments-sdk`. Route-specific usage is defined in `processor/src/routes/operation.route.ts` and `processor/src/routes/nuvei-payment.route.ts`. Nuvei DMN requests are pre-filtered by `processor/src/libs/fastify/hooks/nuvei-header-auth.hook.ts` and cryptographically validated in `processor/src/services/nuvei-payment.service.ts`.

**Security headers and CORS:** `processor/src/server/server.ts` sets `x-content-type-options`, `referrer-policy`, `x-frame-options`, and `permissions-policy` on all responses and restricts CORS origins to configured Checkout and extra allowed origins.

**Payment state integrity:** `processor/src/services/nuvei-payment.service.ts` verifies cart ownership, Nuvei session token/payment linkage, amount, currency, transaction ID, merchant identifiers, and DMN idempotency before writing successful transaction updates.

**Configuration:** `processor/src/config/config.ts` is the single runtime configuration module. `connect.yaml` is the deployment-facing configuration declaration. Do not read `.env` values directly outside the config module.

---

*Architecture analysis: 2026-06-02*
