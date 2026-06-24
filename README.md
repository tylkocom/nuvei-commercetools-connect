<!-- generated-by: gsd-doc-writer -->
# Nuvei commercetools Connector

A private commercetools Connect payment Connector that integrates Nuvei payments with commercetools Checkout and custom storefronts.

## Installation

This repository contains two Connect applications and a browser evidence harness in `examples/nuvei-web-ui/`. Install dependencies per package from the repository root:

```bash
npm ci --prefix enabler
npm ci --prefix processor
npm ci --prefix examples/nuvei-web-ui
```

The CI workflow uses Node.js 20. The package lockfiles are npm lockfiles; there is no root-level `package.json` or workspace install command in this repository.

## Quick start

1. Install package dependencies:

   ```bash
   npm ci --prefix enabler
   npm ci --prefix processor
   ```

2. Build the frontend enabler and backend processor:

   ```bash
   npm run build --prefix enabler
   npm run build --prefix processor
   ```

3. Validate the Connect descriptor with the same CLI version used by CI:

   ```bash
   npm install --global @commercetools/cli@0.0.17
   commercetools connect validate .
   ```

4. Optional: run the local mocked commercetools harness:

   ```bash
   npm ci --prefix examples/nuvei-web-ui
   npm start --prefix examples/nuvei-web-ui
   ```

   The mock server listens on `http://localhost:8089` by default and exposes `/ledger`, `/config`, `/payment-components`, `/payments`, `/payments/confirm/payment-local-001`, `/webhooks/nuvei`, and `/payment-intents/payment-local-001`.

## Project layout

| Path | Purpose |
| --- | --- |
| `connect.yaml` | commercetools Connect deployment descriptor. Defines the `enabler` assets application, the `processor` service application, deployment scripts, and required configuration keys. |
| `enabler/` | Browser-side Nuvei wrapper built with TypeScript and Vite. It exports the Checkout-facing `Enabler` adapter for `card` and `blik` components plus `embedded` drop-ins. |
| `processor/` | Fastify service that creates Nuvei payment sessions, confirms widget results, handles commercetools payment operations, and processes Nuvei DMN webhooks. |
| `examples/nuvei-web-ui/` | Local Express mock server and browser evidence harness for exercising connector flows with mocked commercetools state. |
| `docs/` | Operational, deployment, architecture, testing, and Nuvei setup documentation. |

## Usage examples

### Mount the card component

`enabler/src/index.ts` exports the Checkout-facing `Enabler` adapter, plus `PaymentMethod`, `PaymentComponentBuilder`, `PaymentDropinBuilder`, `SimplyConnectDropinBuilder`, `WebSdkCardBuilder`, and `WebSdkBlikBuilder`. Migration note: legacy `NuveiSimplyConnectEnabler`, `NuveiWebSdkEnabler`, `NuveiEnabler`, and `SimplyConnectCardBuilder` exports were removed; use `new Enabler(...).createComponentBuilder("card")` for Web SDK card, `new Enabler(...).createComponentBuilder("blik")` for Web SDK BLIK, and `new Enabler(...).createDropinBuilder("embedded")` for Simply Connect.
```ts
import { Enabler } from "@nuvei-commercetools/enabler";

const enabler = new Enabler({
  processorUrl: "https://service-<id>.<region>.gcp.commercetools.app",
  sessionId: "<checkout-session-id>",
  locale: "en",
  countryCode: "DE",
  onComplete: (result) => {
    if (result.isSuccess) {
      console.log(result.paymentReference);
    }
  },
  onError: console.error,
});

const builder = await enabler.createComponentBuilder("card");
const component = builder.build({});
await component.mount("#payment-container");
await component.submit({ storePaymentDetails: false });
```

Expected result: the Checkout-facing enabler fetches Nuvei frontend configuration from `GET /operations/config`, loads the Nuvei SafeCharge SDK, calls the processor's `POST /payments/session` endpoint with `{ "paymentMethodOptions": { "card": {} } }`, renders the card field into `#payment-container`, and calls `onComplete({ isSuccess: true, paymentReference })` after the processor returns `{ outcome: "approved" }` from `POST /payments/confirm/:id`. A rejected outcome calls `onComplete({ isSuccess: false, paymentReference })`. A pending outcome calls the optional `onPending({ paymentReference })` callback when provided; without `onPending`, the enabler uses bounded retries before calling `onComplete({ isSuccess: false, paymentReference })`. Browser callbacks never expose the Nuvei session token.

<!-- VERIFY: Replace the placeholder processor URL with the actual deployed Connect service URL for the target deployment. -->

### Mount the Simply Connect drop-in

Use this path for Merchant Center `Drop-in` payment integrations. Nuvei owns the internal pay button, so `dropinHasSubmit` is `false`; Checkout can still provide `onPayButtonClick` for final terms/order validation through Nuvei `prePayment`.

```ts
import { Enabler } from "@nuvei-commercetools/enabler";

const enabler = new Enabler({
  processorUrl: "https://service-<id>.<region>.gcp.commercetools.app",
  sessionId: "<checkout-session-id>",
  locale: "en",
  countryCode: "DE",
  onComplete: ({ isSuccess, paymentReference }) => {
    console.log({ isSuccess, paymentReference });
  },
  onPending: ({ paymentReference }) => {
    console.log({ pendingPaymentReference: paymentReference });
  },
  onError: console.error,
});

const builder = await enabler.createDropinBuilder("embedded");
console.log(builder.dropinHasSubmit); // false

const dropin = builder.build({
  onPayButtonClick: async () => {
    // Check terms acceptance or final order readiness here.
  },
});
await dropin.mount("#payment-container");
```

Expected result: `POST /payments/session` is called with `{ "paymentMethodOptions": { "embedded": {} } }`, Nuvei Simply Connect renders in-place, and the checkout config includes `pmWhitelist: ["cc_card"]` so the first drop-in demo remains card-only.


### Mount the Web SDK BLIK component

Web SDK BLIK is available by default as a Web Components integration. Use it only where BLIK prerequisites are satisfied: Nuvei account enablement, PLN currency, Polish shopper country, and sandbox evidence before production claims.

```ts
import { Enabler } from "@nuvei-commercetools/enabler";

const enabler = new Enabler({
  processorUrl: "https://service-<id>.<region>.gcp.commercetools.app",
  sessionId: "<checkout-session-id>",
  locale: "pl",
  countryCode: "PL",
  onComplete: ({ isSuccess, paymentReference }) => {
    console.log({ isSuccess, paymentReference });
  },
  onPending: ({ paymentReference }) => {
    console.log({ pendingPaymentReference: paymentReference });
  },
  onError: console.error,
});

const builder = await enabler.createComponentBuilder("blik");
const component = builder.build({
  onPayButtonClick: async () => {
    // Check terms acceptance or final order readiness here.
  },
});
await component.mount("#payment-container");
await component.submit();
```

Expected result: `POST /payments/session` is called with `{ "paymentMethodOptions": { "blik": {} } }`, the session response contains safe method metadata such as `uiMethod: "blik"`, `paymentMethod: "blik"`, `integrationSurface: "web-sdk"`, and `countryCode: "PL"`, and the BLIK code is collected by the browser component for Nuvei Web SDK only. The code is never sent to the processor.

### Create a payment session through the processor

The processor registers payment routes under `/payments` in `processor/src/server/plugins/nuvei-payment.plugin.ts`.

```bash
curl -X POST "https://service-<id>.<region>.gcp.commercetools.app/payments/session" \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: <checkout-session-id>" \
  -d '{
    "paymentMethodOptions": {
      "embedded": {}
    }
  }'
```

Expected response shape:
```json
{
  "cartId": "<cart-id>",
  "sessionToken": "<nuvei-session-token>",
  "paymentReference": "<commercetools-payment-id>",
  "merchantReturnUrl": "<return-url>",
  "amount": "10.00",
  "currency": "<cart-currency>",
  "uiMethod": "embedded",
  "paymentMethod": "card",
  "integrationSurface": "simply-connect",
  "countryCode": "<country-code-if-returned>"
}
```

Use `{ "paymentMethodOptions": { "card": {} } }` for the Web Components card path, `{ "paymentMethodOptions": { "blik": {} } }` for the Web SDK BLIK path, and `{ "paymentMethodOptions": { "embedded": {} } }` for the Simply Connect drop-in path. The local example harness defaults to the Checkout-facing drop-in path and can switch to the same `Enabler` component route for Web SDK card or BLIK comparison.

<!-- VERIFY: Replace the placeholder processor URL with the actual deployed Connect service URL for the target deployment. -->

### Inspect supported payment UI methods

`enabler/src/payment-enabler/method-registry.ts` and the processor payment-components DTO advertise:

```ts
import {
  getComponentPaymentMethods,
  getDropinPaymentMethods,
  PaymentMethod,
} from "@nuvei-commercetools/enabler";

console.log(getComponentPaymentMethods().map((method) => method.key));
// ["card", "blik"]

console.log(getDropinPaymentMethods().map((method) => method.key));
// ["embedded"]

console.log(PaymentMethod.card, PaymentMethod.blik, PaymentMethod.embedded);
// "card" "blik" "embedded"
```

`GET /operations/payment-components` returns `{ "dropins": [{ "type": "embedded" }], "components": [{ "type": "card" }, { "type": "blik" }], "express": [] }` by default. BLIK still requires Nuvei account enablement, PLN/PL shopper data, and sandbox evidence before production claims.

### Merchant Center Drop-in setup

1. Install or deploy the Organization Connector.
2. Create or open a Complete Checkout or Payment Only Application.
3. In Payment integrations, add Standard Payments.
4. Select the Nuvei connector deployment.
5. Select `Drop-in` as the payment integration type.
6. Enter a name such as `Nuvei Simply Connect`.
7. Optionally set key `nuvei-simply-connect-dropin`.
8. Save and activate the Payment Integration.
9. Set the Application status active.
10. For programmatic setup, ensure `paymentsConfiguration.activePaymentComponentType` is `DropIn`.

Payment Integrations API draft shape:

```json
{
  "key": "nuvei-simply-connect-dropin",
  "application": { "typeId": "application", "id": "<application-id>" },
  "connectorDeployment": { "typeId": "connector-deployment", "id": "<deployment-id>" },
  "componentType": "DropIn",
  "type": "embedded",
  "name": "Nuvei Simply Connect",
  "status": "Active",
  "sortingInfo": { "priority": 0 }
}
```


## Runtime behavior

The connector follows the commercetools payment integration split defined in `connect.yaml`:

- `enabler` is deployed as a Connect `assets` application and serves the browser bundle generated by Vite.
- `processor` is deployed as a Connect `service` application on `/` and starts `node dist/index.js` after `npm run build --prefix processor`.
- `processor` validates required configuration at startup in `processor/src/config/config.ts`.
- `processor` exposes:
  - `POST /payments/session` and `POST /payments/confirm/:id` for payment session creation and widget result confirmation. `POST /payments/confirm/:id` returns `{ outcome: "approved" | "rejected" | "pending" }` with HTTP `200` for approved and pending, `402` for rejected.
  - `POST /webhooks/nuvei` for Nuvei DMN webhook processing with raw-body checksum validation.
  - `GET /config`, `GET /health`, `GET /status`, `GET /payment-components`, `POST /payment-intents/:id`, and `POST /transactions` for Connect payment operations. The same operation routes are also mounted under `/operations/*` for commercetools Checkout integration callbacks. `GET /health` reports config presence plus the running commit hash.
- `processor/src/services/nuvei-payment.service.ts` implements authorization, capture, cancel, refund, reverse, transaction creation, payment confirmation, and DMN reconciliation.

## Configuration

Deployment configuration is declared in `connect.yaml`; runtime validation is implemented in `processor/src/config/config.ts`.

Required standard configuration:

| Variable | Description |
| --- | --- |
| `CTP_PROJECT_KEY` | commercetools project key. |
| `CTP_AUTH_URL` | commercetools OAuth URL. Defaults to `https://auth.europe-west1.gcp.commercetools.com`. |
| `CTP_API_URL` | commercetools API URL. Defaults to `https://api.europe-west1.gcp.commercetools.com`. |
| `CTP_SESSION_URL` | Session API URL. Defaults to `https://session.europe-west1.gcp.commercetools.com`. |
| `CTP_JWKS_URL` | JWKS URL for JWT validation. Defaults to `https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json`. |
| `CTP_JWT_ISSUER` | JWT issuer. Defaults to `https://mc-api.europe-west1.gcp.commercetools.com`. |
| `CTP_CHECKOUT_URL` | Checkout API URL. Defaults to `https://checkout.europe-west1.gcp.commercetools.com`. |
| `NUVEI_ENV` | Nuvei environment, `test` or `production`. Defaults to `test`. |
| `NUVEI_MERCHANT_ID` | Nuvei merchant ID. |
| `NUVEI_MERCHANT_SITE_ID` | Nuvei merchant site ID. |
| `NUVEI_API_BASE_URL` | Nuvei API base URL. |

Required secured configuration:

| Variable | Description |
| --- | --- |
| `CTP_CLIENT_ID` | commercetools API client ID. Required scopes: `manage_checkout_payment_intents`, `manage_checkout_transactions`, `manage_payments`, `manage_orders`, `view_sessions`, `view_api_clients`, and `introspect_oauth_tokens`. |
| `CTP_CLIENT_SECRET` | commercetools API client secret. |
| `NUVEI_SECRET_KEY` | Nuvei secret key used for signing API requests and validating DMN checksums. |

Optional configuration:

| Variable | Default | Description |
| --- | --- | --- |
| `NUVEI_DMN_CHECKSUM_ALGORITHM` | `sha256` | DMN checksum algorithm. Startup validation only accepts `sha256`. |
| `CORS_ALLOWED_ORIGINS` | empty | Comma-separated extra browser origins granted CORS access by the processor. The origin of `CTP_CHECKOUT_URL` is always allowed; every other origin is denied. |
| `HEALTH_CHECK_TIMEOUT` | `5000` | Timeout used by processor status checks. |
| `LOGGER_LEVEL` | `info` | Fastify logger level. |
| `CONNECT_SERVICE_URL` | empty | Public processor base URL. Used by connector deployment scripts and passed to Nuvei `openOrder` as `urlDetails.notificationUrl` (`${CONNECT_SERVICE_URL}/webhooks/nuvei`) so DMNs reach this deployment. |
| `PORT` | `8080` | Processor listening port. |
| `RETURN_URL` | empty | Optional merchant return URL. Must use HTTPS when set. |

## Development commands

Run commands from the repository root with `--prefix`:

| Command | Description |
| --- | --- |
| `npm run dev --prefix enabler` | Start the Vite development server for the frontend enabler. |
| `npm run build --prefix enabler` | Type-check and build the enabler bundle into `enabler/public/`. |
| `npm run start --prefix enabler` | Serve `enabler/public` on port 8080 with CORS enabled. |
| `npm run serve --prefix enabler` | Build the enabler, then serve `enabler/public` on port 3000 with CORS enabled. |
| `npm run test --prefix enabler` | Run enabler Vitest tests through `enabler/scripts/run-vitest.mjs`. |
| `npm run dev --prefix processor` | Start the Fastify processor from `processor/src/index.ts` using `tsx`. |
| `npm run build --prefix processor` | Remove `processor/dist` and compile TypeScript. |
| `npm start --prefix processor` | Start the built processor with `node dist/index.js`. |
| `npm run test --prefix processor` | Run processor Vitest tests through `processor/scripts/run-vitest.mjs`. |
| `npm start --prefix examples/nuvei-web-ui` | Start the local mocked commercetools test server and browser harness. |

## Testing

Run both package test suites:

```bash
npm run test --prefix enabler
npm run test --prefix processor
```

For manual local flow testing, use the files in `examples/nuvei-web-ui/`:

- `examples/nuvei-web-ui/mock-commercetools-server.mjs` starts the local mock server.
- `examples/nuvei-web-ui/index.html` provides the browser evidence page with the mode selector.
- `examples/nuvei-web-ui/start-dmn-tunnel.mjs` exposes `/webhooks/nuvei` to the Nuvei sandbox.

## Deployment

The Connect descriptor deploys:

| Application | Connect type | Build artifact / entry point |
| --- | --- | --- |
| `enabler` | `assets` | Vite bundle served from `enabler/public/connector-enabler.es.js`. |
| `processor` | `service` | `processor/dist/index.js` started by `npm start --prefix processor`. |

`connect.yaml` configures processor deployment scripts:

- `postDeploy`: `npm install && npm run connector:post-deploy`
- `preUndeploy`: `npm install && npm run connector:pre-undeploy`

After deployment, configure the Nuvei DMN URL in the Nuvei dashboard so Nuvei can call `POST /webhooks/nuvei` on the deployed processor.

<!-- VERIFY: Confirm the deployed processor URL shown by the Connect deployment logs before configuring the Nuvei dashboard. -->

## CI validation

`.github/workflows/connect-validate.yml` runs on pull requests, pushes to `main`, and manual dispatch. The workflow:

1. Checks out the repository.
2. Sets up Node.js 20 with npm cache entries for `enabler/package-lock.json` and `processor/package-lock.json`.
3. Runs `npm ci --prefix enabler`.
4. Runs `npm ci --prefix processor`.
5. Installs `@commercetools/cli@0.0.17` globally.
6. Runs `commercetools connect validate .`.

## License

No `LICENSE` file and no package-level `license` field were found in this repository. Treat usage and distribution terms as unspecified until a license is added.
