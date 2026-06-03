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
| `enabler/` | Browser-side Nuvei wrapper built with TypeScript and Vite. It exports the explicit dual-mode card enablers and card component support. |
| `processor/` | Fastify service that creates Nuvei payment sessions, confirms widget results, handles commercetools payment operations, and processes Nuvei DMN webhooks. |
| `examples/nuvei-web-ui/` | Local Express mock server and browser evidence harness for exercising connector flows with mocked commercetools state. |
| `docs/` | Operational, deployment, architecture, testing, and Nuvei setup documentation. |

## Usage examples

### Mount the card component

`enabler/src/index.ts` exports `NuveiSimplyConnectEnabler`, `NuveiWebSdkEnabler`, `NuveiEnabler`, `PaymentMethod`, `PaymentComponentBuilder`, `SimplyConnectCardBuilder`, and `WebSdkCardBuilder`.
```ts
import { NuveiEnabler } from "@nuvei-commercetools/enabler";

const enabler = new NuveiEnabler({
  processorUrl: "https://service-<id>.<region>.gcp.commercetools.app",
  sessionId: "<checkout-session-id>",
  merchantId: "<nuvei-merchant-id>",
  merchantSiteId: "<nuvei-merchant-site-id>",
  env: "test",
  locale: "en",
  onComplete: (result) => {
    if (result.isSuccess) {
      console.log(result.paymentReference, result.sessionToken);
    }
  },
  onError: console.error,
}, "simply-connect");

const builder = await enabler.createComponentBuilder("card");
const component = builder.build({});
component.mount("#payment-container");
```

Expected result: the enabler loads the Nuvei SafeCharge SDK, calls the processor's `POST /payments/session` endpoint to create a payment session, renders the card widget into `#payment-container`, and calls `onComplete` after the processor returns `{ outcome: "approved" }` from `POST /payments/confirm/:id`. A `rejected` outcome calls `onError` with a safe error. A `pending` outcome calls the optional `onPending` callback. Pass `"web-sdk"` to the facade, or use `NuveiWebSdkEnabler` directly, to mount the Web SDK card mode and show the external Pay button. `onComplete` is only called for approved outcomes.

<!-- VERIFY: Replace the placeholder processor URL with the actual deployed Connect service URL for the target deployment. -->

### Create a payment session through the processor

The processor registers payment routes under `/payments` in `processor/src/server/plugins/nuvei-payment.plugin.ts`.

```bash
curl -X POST "https://service-<id>.<region>.gcp.commercetools.app/payments" \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: <checkout-session-id>" \
  -d '{
    "paymentMethodOptions": {
      "card": {}
    }
  }'
```

Expected response shape:

```json
{
  "cartId": "<cart-id>",
  "sessionToken": "<nuvei-session-token>",
  "paymentReference": "<commercetools-payment-id>",
  "merchantReturnUrl": "<return-url>"
}
```

Use `{ "paymentMethodOptions": { "card": {} } }` for the card component. The local example harness exercises the same card body against the mock server.

<!-- VERIFY: Replace the placeholder processor URL with the actual deployed Connect service URL for the target deployment. -->

### Inspect supported payment UI methods

`enabler/src/payment-enabler/method-registry.ts` and the processor payment-components DTO advertise:

```ts
import { getComponentPaymentMethods, PaymentMethod } from "@nuvei-commercetools/enabler";

console.log(getComponentPaymentMethods().map((method) => method.key));
// ["card"]

console.log(PaymentMethod.card);
// "card"
```

Expected result: custom storefront or Checkout integration code can distinguish the card component from the explicit mode enablers without hard-coding display metadata.

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
| `CTP_CLIENT_ID` | commercetools API client ID. `connect.yaml` documents the required scopes. |
| `CTP_CLIENT_SECRET` | commercetools API client secret. |
| `NUVEI_SECRET_KEY` | Nuvei secret key used for signing API requests and validating DMN checksums. |

Optional configuration:

| Variable | Default | Description |
| --- | --- | --- |
| `NUVEI_DMN_CHECKSUM_ALGORITHM` | `sha256` | DMN checksum algorithm. Startup validation only accepts `sha256`. |
| `CORS_ALLOWED_ORIGINS` | empty | Comma-separated extra browser origins accepted by the processor CORS policy. The Merchant Center origin derived from `CTP_JWT_ISSUER` and `CTP_CHECKOUT_URL` are always allowed. |
| `HEALTH_CHECK_TIMEOUT` | `5000` | Timeout used by processor status checks. |
| `LOGGER_LEVEL` | `info` | Fastify logger level. |
| `CONNECT_SERVICE_URL` | empty | Service URL used by connector deployment scripts and runtime integrations. |
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
| `npm start --prefix testing` | Start the local mocked commercetools test server. |

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
