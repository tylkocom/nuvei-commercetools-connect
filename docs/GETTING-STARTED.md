# Getting Started

This guide gets the Nuvei commercetools Connector installed, validated, and running locally from a fresh checkout.

## Prerequisites

Install these tools before working with the repository:

| Tool | Version / requirement | Why it is needed |
| --- | --- | --- |
| Git | Any current version | Clone the private repository. |
| Node.js | `20.x` | `.github/workflows/connect-validate.yml` runs the validation workflow on Node.js 20. No `engines` field or `.nvmrc` is present in the packages. |
| npm | Bundled with Node.js | Each package uses an npm `package-lock.json`; there is no root workspace install. |
| commercetools CLI | `@commercetools/cli@0.0.17` | The CI workflow installs this version and runs `commercetools connect validate .`. |

For functional processor runs against real services, you also need:

- commercetools project credentials with the scopes documented in `connect.yaml`.
- Nuvei merchant ID, merchant site ID, secret key, and HTTPS Nuvei API base URL.
- HTTPS values for every configured external URL and return URL. The processor validates HTTPS at startup. Use HTTPS origins in `CORS_ALLOWED_ORIGINS` for deployed environments; plain-HTTP origins are accepted only for local development.

<!-- VERIFY: Confirm the production commercetools region, Nuvei account details, and deployed processor URL with the environment owner before using real credentials. -->

## Installation steps

1. Clone the repository:

   ```bash
   git clone git@github.com:wykwit-tylko/commercetools-connect-payment-integration-nuvei.git
   cd commercetools-connect-payment-integration-nuvei
   ```

2. Install the connector package dependencies:

   ```bash
   npm ci --prefix enabler
   npm ci --prefix processor
   ```

3. Install the optional local testing harness dependencies when you want to run the mock server or browser test page:

   ```bash
   npm ci --prefix testing
   ```

4. Install the commercetools CLI version used by CI:

   ```bash
   npm install --global @commercetools/cli@0.0.17
   ```

5. Build both connector applications:

   ```bash
   npm run build --prefix enabler
   npm run build --prefix processor
   ```

6. Validate the Connect descriptor:

   ```bash
   commercetools connect validate .
   ```

## First run

For the quickest local output that does not require external credentials, start the mocked commercetools test harness:

```bash
npm start --prefix testing
```

The mock server listens on `http://localhost:8089` by default. It keeps an in-memory cart and payment ledger using these fixed local IDs:

- Cart: `cart-local-001`
- Payment: `payment-local-001`
- Amount: `10.00 EUR`

To run the real processor locally after configuring environment variables, use:

```bash
npm run dev --prefix processor
```

The processor loads dotenv from its process working directory and listens on `0.0.0.0:${PORT}`, with `PORT` defaulting to `8080`.

To run the enabler development server, use:

```bash
npm run dev --prefix enabler
```

To build and serve the generated enabler assets from `enabler/public`, use either:

```bash
npm run start --prefix enabler
```

or:

```bash
npm run serve --prefix enabler
```

`npm run start --prefix enabler` serves `enabler/public` on port `8080`; `npm run serve --prefix enabler` builds first and then serves `enabler/public` on port `3000`.

## Common setup issues

### Running npm commands from the repository root without `--prefix`

There is no root-level `package.json` and no npm workspace configuration. Run package commands with `--prefix` from the root, or change into the package directory first:

```bash
npm ci --prefix enabler
npm ci --prefix processor
npm run test --prefix processor
```

### Processor fails with `Missing required configuration: ...`

`processor/src/index.ts` calls `validateConfig()` before the Fastify server starts. Startup fails when required values are missing or still set to the rejected `xxx` fallback. At minimum, local processor runs need valid values for:

- `CTP_CLIENT_ID`
- `CTP_CLIENT_SECRET`
- `NUVEI_MERCHANT_ID`
- `NUVEI_MERCHANT_SITE_ID`
- `NUVEI_SECRET_KEY`
- `NUVEI_API_BASE_URL`

See `docs/CONFIGURATION.md` for the full environment variable table and local dotenv example.

### Processor fails because a URL is not HTTPS

Runtime validation rejects non-HTTPS values for configured external endpoints and `RETURN_URL`. Use HTTPS URLs for commercetools endpoints, the Nuvei API base URL, and return URLs. `CORS_ALLOWED_ORIGINS` entries are not HTTPS-validated so local origins such as `http://localhost:3000` can be allowlisted during development; use HTTPS origins in deployed environments.

### Local dotenv values are not being loaded

The processor calls `dotenv.config()` without a custom path. Dotenv reads `.env` from the process current working directory. Prefer starting the processor through npm with the package prefix:

```bash
npm run dev --prefix processor
```

or change into `processor/` before running package-local commands.

### `commercetools connect validate .` is not found

Install the CLI version used by CI:

```bash
npm install --global @commercetools/cli@0.0.17
```

Then run validation again from the repository root:

```bash
commercetools connect validate .
```

## Next steps

- Read `docs/CONFIGURATION.md` before running the processor against real commercetools or Nuvei services.
- Read `docs/ARCHITECTURE.md` for the enabler, processor, route, and payment-flow structure.
- Read `docs/TESTING.md` for unit test and local flow testing guidance.
- Read `docs/DEPLOYMENT.md` before deploying through commercetools Connect.
