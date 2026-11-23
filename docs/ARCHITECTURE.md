# Architecture

## System overview

The Nuvei commercetools Connector is a commercetools Connect payment integration with two deployed applications: an `assets` application (`enabler`) that runs in the browser and renders the Checkout-compatible Nuvei Simply Connect `embedded` drop-in, the Web SDK card component, or the Web SDK BLIK component, and a `service` application (`processor`) that exposes Fastify HTTP routes for commercetools Checkout, creates and updates commercetools Payments, and calls Nuvei server APIs. The primary inputs are commercetools session- or OAuth-authenticated payment requests, Nuvei widget callbacks, and Nuvei Direct Merchant Notification (DMN) webhooks. The primary outputs are Nuvei payment sessions or transaction operations and updated commercetools Payments.

## Component diagram

```mermaid
graph TD
  Browser[Browser / commercetools Checkout] --> Enabler[enabler assets package]
  Enabler --> NuveiSDK[Nuvei Simply Connect / SafeCharge SDK]
  Enabler --> ProcessorRoutes[processor Fastify routes]
  ProcessorRoutes --> PaymentSDK[commercetools Connect Payments SDK]
  ProcessorRoutes --> NuveiPaymentService[NuveiPaymentService]
  NuveiPaymentService --> CtPaymentCreation[CtPaymentCreationService]
  NuveiPaymentService --> NuveiClient[NuveiClient]
  NuveiPaymentService --> EventConverter[NuveiEventConverter]
  PaymentSDK --> Commercetools[commercetools APIs]
  CtPaymentCreation --> Commercetools
  NuveiClient --> NuveiAPI[Nuvei REST API]
  NuveiAPI --> ProcessorRoutes
```

## Data flow

### Checkout payment creation and confirmation

1. A storefront or commercetools Checkout page instantiates the Checkout-facing `Enabler` adapter from `enabler/src/index.ts` with the processor URL, commercetools session ID, locale/country when available, and completion/error callbacks. Nuvei merchant identifiers and environment are fetched from the processor, not supplied by the shopper page.
2. The caller asks the enabler for a Web Components card builder (`createComponentBuilder("card")`), a Web Components BLIK builder (`createComponentBuilder("blik")`), or the Simply Connect drop-in builder (`createDropinBuilder("embedded")`). Component builders are host-submit compatible (`componentHasSubmit = true`); the drop-in builder has `dropinHasSubmit = false` because Nuvei owns the internal pay button.
3. `apiService.getConfig()` sends `GET /operations/config` (the `X-Session-ID` header is sent but not required — Checkout fetches connector config before a session exists); the processor returns only shopper-safe Nuvei frontend configuration (environment, merchant ID, merchant site ID).
4. Web SDK components load the Nuvei SafeCharge Web SDK from `https://cdn.safecharge.com/safecharge_resources/v1/websdk/safecharge.js`; `SimplyConnectDropinComponent` loads Simply Connect v1 from `https://cdn.safecharge.com/safecharge_resources/v1/checkout/checkout.js`, passes `pmWhitelist: ["cc_card"]`, and gates Nuvei's pay button through `prePayment`/`onPayButtonClick`.
5. `apiService.createPayment()` sends `POST /payments/session` with `X-Session-ID`. The processor registers this route in `processor/src/server/plugins/nuvei-payment.plugin.ts` and authenticates it with the commercetools session header hook. The request body is `{ paymentMethodOptions: { card: {} } }` for Web SDK card, `{ paymentMethodOptions: { blik: {} } }` for Web SDK BLIK, `{ paymentMethodOptions: { embedded: {} } }` for the drop-in path, and defaults to `card` when omitted.
6. `NuveiPaymentService.createPaymentSession()` reads the cart ID from request context, fetches the cart through the commercetools Connect Payments SDK, and **locks the cart** with the `freezeCart` update action (`HardFreeze` strategy) before any other processing — the cart total, discounts, and shipping can no longer drift between the Nuvei session and reconciliation. An already-frozen cart is accepted as-is (idempotent retries, second payment attempts); `Ordered`/`Merged` carts are rejected with `CART_NOT_LOCKABLE` (409). The planned payment amount is then calculated from the frozen cart, `NuveiClient.openOrder()` is called, and a commercetools Payment is created through `CtPaymentCreationService.handleCtPaymentCreation()`. If session setup fails after this request froze the cart, the processor unfreezes it best-effort so the shopper is not left with an immutable cart. The same locking applies to the `/operations/transactions` flow.

   The commercetools Payment is created with the deterministic `key` `nuvei-<orderId>`, where `orderId` is the `openOrder` response's `orderId` (Nuvei echoes it back on DMNs as `PPP_TransactionID`). Because Checkout mounts several dropins at once (card and BLIK each create a session on mount, and every retry creates another), a cart accumulates unused Payments. They are intentionally left linked to the cart: a session's widget can stay open and still be paid later, and `confirmPayment` requires the Payment to be on the cart, so unlinking a Payment that could still be paid would leave a charged shopper without an order. The key lets DMN resolution ignore these siblings.
7. The processor returns the cart ID, Nuvei `sessionToken`, commercetools payment reference, merchant return URL, and safe method metadata (`uiMethod`, `paymentMethod`, `integrationSurface`, and optional `countryCode`) to the enabler.
8. The enabler renders the chosen Nuvei UI. Card and BLIK components send payment details directly from the browser to Nuvei Web SDK; the BLIK code is never sent to the processor. The browser paths send the commercetools Payment ID through Nuvei merchant-reference aliases (`merchant_unique_id`, `merchantUniqueId`, and `merchantUniqueID`); the Web SDK paths also send `clientUniqueId` as the commercetools cart ID. The exact CT Payment is correlated by `merchant_unique_id` when it is a CT Payment ID, by DMN `sessionToken` matching `Payment.interfaceId`, or, for cart-referenced DMNs, by matching Nuvei transaction identifiers against existing cart Payment transactions.
9. After the widget reports a result, `confirmPaymentResult()` calls `POST /payments/confirm/:paymentReference` with the server-issued Nuvei session token, never a token echoed from the browser result.
10. `NuveiPaymentService.confirmPayment()` retrieves the commercetools Payment, verifies that the authenticated session cart owns that Payment, calls `NuveiClient.getPaymentStatus()`, classifies the Nuvei status, and returns a tri-state outcome: `approved`, `rejected`, or `pending`. Card confirmations write CT `Authorization` transactions; BLIK confirmations/DMNs use CT `Charge` transactions. The interaction ID prefers Nuvei `PPP_TransactionID`, then Nuvei `TransactionID`/`transactionId`, then the already-bound Nuvei session token as a final idempotency key. Pending (inconclusive or unknown Nuvei status) does not write a terminal CT transaction.

### Server-driven transaction creation

1. commercetools Checkout can call `POST /transactions` using OAuth2 plus `manage_checkout_transactions` authorization.
2. `operationsRoute` forwards the request to `NuveiPaymentService.handleTransaction()`.
3. The service fetches the cart, determines the requested or cart-derived amount, opens a Nuvei order, creates a commercetools Payment, attaches it to the cart, and returns a transaction status (`Pending` or `Failed`).

### Payment modification operations

1. commercetools Checkout calls `POST /payment-intents/:id` using OAuth2 plus `manage_checkout_payment_intents` authorization.
2. `operationsRoute` passes the request to the local `AbstractPaymentService.modifyPayment()` flow in `processor/src/services/abstract-payment.service.ts`, with Nuvei-specific methods implemented by `NuveiPaymentService`.
3. `NuveiPaymentService.capturePayment()` calls Nuvei `settleTransaction` and returns an approved modification response only when Nuvei reports `transactionStatus: APPROVED`; gateway declines (`DECLINED`/`ERROR`) and missing transaction status map to a rejected response.
4. `NuveiPaymentService.cancelPayment()` calls Nuvei `voidTransaction` with the same `transactionStatus` gate: only `APPROVED` produces an approved response.
5. `NuveiPaymentService.refundPayment()` calls Nuvei `refundTransaction` and returns a received modification response for `APPROVED` or `PENDING` (refunds can complete asynchronously); declines and errors map to a rejected response.
6. `NuveiPaymentService.reversePayment()` chooses refund when a successful `Charge` exists, cancel when a successful `Authorization` exists, and otherwise rejects the operation as invalid.

### Nuvei DMN webhook reconciliation

1. Nuvei sends a DMN webhook to `POST /webhooks/nuvei`.
2. Fastify captures the raw body for `/webhooks/nuvei` and routes the request through `NuveiHeaderAuthHook`.
3. `NuveiPaymentService.processNuveiDmn()` validates Nuvei's SHA-256 DMN checksum with `NuveiClient.validateDmnChecksum()` and verifies the merchant ID and merchant site ID against configured values.
4. The service first resolves the commercetools Payment by key: the DMN's `PPP_TransactionID` is the `openOrder` `orderId`, so `GET /payments/key=nuvei-<PPP_TransactionID>` identifies the exact Payment in one call, independent of how many sibling or abandoned Payments are linked to the cart (no cart scan, no per-sibling `getPaymentStatus` verification). A 404 falls through to the legacy paths below (Payments created before keys existed, settle/refund DMNs); other errors fail the DMN so Nuvei retries. If the DMN also carries a `sessionToken` it must match the Payment's `interfaceId`. Otherwise, the service resolves the exact commercetools Payment by `merchant_unique_id` when it is a CT Payment ID. If `merchant_unique_id` is absent or not a CT Payment ID, it falls back to `sessionToken -> Payment.interfaceId`. If Nuvei sent a cart ID in `merchant_unique_id`, the service loads linked cart Payments and disambiguates by amount/currency plus existing Nuvei transaction identity or a single existing terminal Payment.
5. The service skips processing if the DMN terminal transaction is already represented on the Payment, including cases where `/payments/confirm/:id` previously wrote the terminal state with a fallback Nuvei transaction ID.
6. `NuveiEventConverter.convertDmnToPaymentUpdate()` maps the Nuvei transaction type and `ppp_status` into a commercetools transaction type and state.
7. For successful authorization or charge DMNs, the service confirms the DMN against `getPaymentStatus`, verifies currency, amount, transaction ID, and cart identity, then updates the commercetools Payment.
8. Optional card metadata from the DMN (`cardCompany`, `cardType`) updates card `paymentMethodInfo`; BLIK DMNs (`payment_method=apmgw_BLIK`) map to method `blik` and display name `BLIK`.

## Key abstractions

| Abstraction | Location | Role |
| --- | --- | --- |
| `Enabler` | `enabler/src/index.ts` | Checkout-facing payment-template-compatible adapter; accepts `processorUrl` and `sessionId`, fetches Nuvei config from the processor, returns Web SDK component builders for `card` and `blik`, and returns the Simply Connect drop-in builder for `embedded`. |
| `PaymentEnabler`, `PaymentComponentBuilder`, `PaymentDropinBuilder` | `enabler/src/payment-enabler/payment-enabler.ts` | Frontend contracts consumed by commercetools Checkout or custom storefront code. Drop-in builders expose `dropinHasSubmit`, not `componentHasSubmit`. |
| `PAYMENT_METHOD_REGISTRY` | `enabler/src/payment-enabler/method-registry.ts`, `processor/src/dtos/operations/payment-components.dto.ts` | Registry of supported UI methods: component `card`, component `blik`, and drop-in `embedded`. |
| `SimplyConnectDropinBuilder` / `SimplyConnectDropinComponent` | `enabler/src/components/simply-connect-dropin.ts` | Checkout-compatible in-page Simply Connect drop-in; creates an embedded session, loads `checkout.js`, whitelists `cc_card`, gates through `prePayment`, and routes tri-state confirmation outcomes without exposing raw Nuvei browser results. |
| `WebSdkCardBuilder` / `WebSdkCardComponent` | `enabler/src/components/web-sdk-card.ts` | Browser card integration for Web SDK mode; creates a card session, loads Nuvei SDK, renders the card field, awaits mount/submit lifecycle calls, and routes tri-state confirmation outcomes. |
| `WebSdkBlikBuilder` / `WebSdkBlikComponent` | `enabler/src/components/web-sdk-blik.ts` | Browser BLIK integration for Web SDK mode; creates a BLIK session with `{ paymentMethodOptions: { blik: {} } }`, collects the BLIK code only in the browser, calls Nuvei with `apmgw_BLIK`, and routes pending/terminal outcomes without exposing raw Nuvei browser results. |
| `apiService` | `enabler/src/services/api-service.ts` | Thin fetch client for `GET /operations/config`, `POST /payments/session`, and `POST /payments/confirm/:id`. |
| `NuveiClient` | `processor/src/clients/nuvei.client.ts` | Server-side Nuvei REST client for `openOrder`, `getPaymentStatus`, `settleTransaction`, `voidTransaction`, `refundTransaction`, and DMN checksum validation. |
| `NuveiPaymentService` | `processor/src/services/nuvei-payment.service.ts` | Core orchestration service for configuration, status, payment creation, transaction handling, payment modifications, confirmation, and DMN processing. |
| `CtPaymentCreationService` | `processor/src/services/ct-payment-creation.service.ts` | Creates commercetools Payments and attaches them to carts. |
| `NuveiEventConverter` | `processor/src/services/converters/nuvei-event.converter.ts` | Converts Nuvei DMN payload fields into commercetools Payment transaction update data. |
| `paymentSDK` | `processor/src/payment-sdk.ts` | Configures the commercetools Connect Payments SDK clients, auth hooks, context propagation, and logging adapter. |
| `setupFastify` | `processor/src/server/server.ts` | Builds the Fastify server, security headers, CORS policy, raw webhook body support, request context, plugins, and error handler. |

## HTTP route structure

| Method | Path | Implemented in | Auth model | Purpose |
| --- | --- | --- | --- | --- |
| `GET` | `/config` | `processor/src/routes/operation.route.ts` | None (public by design; Checkout calls it before a session exists) | Return frontend Nuvei environment, merchant ID, and merchant site ID — shopper-safe values only. |
| `GET` | `/status` | `processor/src/routes/operation.route.ts` | JWT | Run commercetools permission and Nuvei reachability checks. |
| `GET` | `/health` | `processor/src/routes/operation.route.ts` | None | No auth. Returns `{ status: ok|degraded, commit: string, checks: [{name, status}] }` based on config-var presence plus the running commit hash. |
| `GET` | `/payment-components`, `/operations/payment-components` | `processor/src/routes/operation.route.ts` | JWT | Return `{ dropins: [{ type: "embedded" }], components: [{ type: "card" }, { type: "blik" }], express: [] }`. |
| `POST` | `/payment-intents/:id`, `/operations/payment-intents/:id` | `processor/src/routes/operation.route.ts` | OAuth2 + `manage_checkout_payment_intents` | Capture, cancel, refund, or reverse a payment intent. |
| `POST` | `/transactions`, `/operations/transactions` | `processor/src/routes/operation.route.ts` | OAuth2 + `manage_checkout_transactions` | Create a server-driven Nuvei order and commercetools Payment for a cart. |
| `POST` | `/payments/session` | `processor/src/routes/nuvei-payment.route.ts` | commercetools session header | Create a payment session for `card`, `blik`, or `embedded`, defaulting to `card` if omitted. |
| `POST` | `/payments/confirm/:id` | `processor/src/routes/nuvei-payment.route.ts` | commercetools session header | Confirm a payment with Nuvei and return `{ outcome: "approved" \| "rejected" \| "pending" }`. HTTP `200` for approved and pending, `402` for rejected. Card writes `Authorization`; BLIK writes `Charge`. Transaction `interactionId` prefers Nuvei `PPP_TransactionID`, then Nuvei transaction ID, then the bound session token. |
| `POST` | `/webhooks/nuvei` | `processor/src/routes/nuvei-payment.route.ts` | Nuvei checksum/header hook | Process Nuvei DMN webhooks and reconcile Payment transactions. |

## Transaction and status mapping

`processor/src/services/payment-converter.ts` defines the mapping from Nuvei events to commercetools Payment transactions.

| Nuvei transaction type | commercetools transaction type |
| --- | --- |
| `Auth`, `PreAuth` | `Authorization` |
| `Settle`, `Sale` | `Charge` |
| `Credit` | `Refund` |
| `Void` | `CancelAuthorization` |
| `Chargeback` | `Chargeback` |

| Nuvei `ppp_status` | commercetools transaction state |
| --- | --- |
| `OK` | `Success` |
| `FAIL` | `Failure` |
| Any other value | `Pending` |

`getStatusInterfaceCode()` derives the following `paymentStatus.interfaceCode` values only when the transaction is successful and the transaction amount equals the planned payment amount.

| Transaction type | Interface code |
| --- | --- |
| `Authorization` | `authorized` |
| `Charge` | `paid` |
| `Refund` | `refunded` |
| `CancelAuthorization` | `cancelled` |
| Any failed transaction | `failed` |

## Directory structure rationale

```text
.
├── connect.yaml
├── enabler/
│   ├── src/
│   │   ├── components/
│   │   ├── payment-enabler/
│   │   └── services/
│   └── package.json
├── processor/
│   ├── src/
│   │   ├── clients/
│   │   ├── config/
│   │   ├── connectors/
│   │   ├── dtos/
│   │   ├── libs/
│   │   ├── routes/
│   │   ├── server/
│   │   └── services/
│   └── package.json
└── examples/
    └── nuvei-web-ui/
```

- `connect.yaml` is the commercetools Connect deployment descriptor. It declares the `enabler` assets application and `processor` service application, plus required standard and secured configuration keys.
- `enabler/` is a Vite-built browser package. Its source is split by public payment contracts (`payment-enabler/`), Checkout/custom components (`components/`), and external service wrappers (`services/`).
- `enabler/src/components/` contains `simply-connect-dropin.ts` and `web-sdk-card.ts`.
- `enabler/src/services/` isolates browser-side external effects: loading the Simply Connect and Web SDK loaders (`simply-connect-sdk.ts`, `web-sdk.ts`) and calling the processor API.
- `processor/` is a TypeScript Fastify service. Its source is split by HTTP concerns (`server/`, `routes/`, `dtos/`), business orchestration (`services/`), external clients (`clients/`), configuration (`config/`), Connect lifecycle scripts (`connectors/`), and shared infrastructure (`libs/`).
- `processor/src/server/` owns Fastify construction, plugin autoloading, request context, security headers, CORS, raw body handling, and global error handling.
- `processor/src/routes/` maps HTTP endpoints to service calls and keeps authentication/authorization requirements close to route definitions.
- `processor/src/services/` owns payment behavior that must remain independent of Fastify route syntax: payment session creation, commercetools Payment creation, Nuvei transaction operations, DMN conversion, and reconciliation.
- `processor/src/clients/` contains the Nuvei API client so request signing, endpoint normalization, timeout handling, and checksum validation are centralized.
- `processor/src/dtos/` defines TypeBox schemas for route validation and response typing.
- `examples/nuvei-web-ui/` contains the phase 2 evidence harness, the mock commercetools server, and the mode selector page at `index.html`.

## Runtime configuration boundaries

The processor reads runtime configuration from environment variables in `processor/src/config/config.ts`; `connect.yaml` declares the Connect-facing configuration keys. Required values include commercetools project/client configuration, commercetools API/Auth/Session/Checkout/JWKS URLs, Nuvei merchant identifiers, Nuvei secret key, and Nuvei API base URL. `validateConfig()` rejects missing required values, unsupported DMN checksum algorithms, and non-HTTPS URLs for commercetools, Nuvei, return URL, and configured CORS origins.

The Checkout-facing frontend `Enabler` receives only host-provided Checkout values (`processorUrl`, `sessionId`, locale/country, callbacks). It retrieves Nuvei merchant ID, merchant site ID, and environment from `GET /operations/config`. Nuvei-specific helper classes still validate explicit merchant ID, merchant site ID, and environment when used directly by custom harnesses.

## Security and reliability boundaries

- Browser-to-processor payment creation and confirmation require a commercetools session ID through `X-Session-ID`.
- Checkout operations that modify payment intents or create transactions use OAuth2 authentication plus explicit authority checks.
- DMN webhook processing validates Nuvei checksum material and configured merchant identifiers before updating commercetools Payment data.
- DMN processing is idempotent: duplicate notifications are short-circuited by exact Nuvei transaction identity and by already-recorded equivalent terminal transactions for the same amount/state.
- Payment confirmation verifies that the Payment belongs to the authenticated cart session before accepting a Nuvei session token.
- Successful payment confirmations validate Nuvei-reported amount, currency, and cart identity before writing CT transactions. CT `Authorization` `interactionId` prefers canonical Nuvei `PPP_TransactionID`, then Nuvei `TransactionID`/`transactionId`, then the already-bound session token as the last stable idempotency key.
- Successful DMNs validate Nuvei-reported amount, currency, and cart identity before updating commercetools Payment data; cart-referenced DMNs are only accepted when they resolve to one exact linked Nuvei Payment.
- Fastify sets defensive response headers (`x-content-type-options`, `referrer-policy`, `x-frame-options`, and `permissions-policy`) for all responses.
- CORS is deny-by-default: only the origin of the configured `CTP_CHECKOUT_URL` and origins explicitly listed in `CORS_ALLOWED_ORIGINS` receive CORS grants. Requests without an `Origin` header (server-to-server: Nuvei DMNs, Checkout Payment Intents) are unaffected by CORS.
- The Nuvei SDK script is loaded with a fixed subresource integrity hash from `enabler/src/services/nuvei-sdk.ts`.

> **SECURITY GAP — requires follow-up:** Nuvei does not publish versioned CDN URLs for `safecharge.js`. The script is served from a mutable path (`/v1/websdk/safecharge.js`) that Nuvei can update at any time without notice. This means:
> - The pinned SRI hash in `NUVEI_SDK_INTEGRITY` will silently break when Nuvei pushes a CDN update, blocking all payment widget rendering.
> - There is no way to audit what changed between the version we pinned and the version now live — Nuvei does not publish changelogs tied to CDN deploys.
> - In the worst case, a supply-chain compromise of the Nuvei CDN would go undetected until the next time someone checks the hash manually.
>
> **Mitigations still required:**
> 1. Add a CI step that fetches `safecharge.js`, computes its SHA-384 hash, and fails the build (or opens an alert) when it diverges from `NUVEI_SDK_INTEGRITY`. This converts a silent production break into a detected drift.
> 2. Raise a support request with Nuvei asking for an immutable, versioned CDN URL or an official SRI hash publication channel.
> 3. Evaluate self-hosting a pinned copy of the script (noting PCI-DSS implications of serving payment JS from merchant infrastructure).
