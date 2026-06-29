# Development

## Local setup

This repository has no root-level `package.json`; install and run each package with npm `--prefix` from the repository root. CI uses Node.js 20 and npm lockfiles for the Connect applications.

1. Clone the repository and enter the project directory:

   ```bash
   git clone git@github.com:wykwit-tylko/commercetools-connect-payment-integration-nuvei.git
   cd commercetools-connect-payment-integration-nuvei
   ```

2. Install package dependencies for local development:

   ```bash
   npm install --prefix enabler
   npm install --prefix processor
   npm install --prefix examples/nuvei-web-ui
   ```

   Use `npm ci --prefix <package>` when you want the same clean lockfile install used by CI.

3. Configure the processor runtime environment. The processor calls `dotenv.config()` from `processor/src/index.ts`, so `npm run dev --prefix processor` loads `processor/.env`. Keep credentials out of source control and use `docs/CONFIGURATION.md` for the complete variable list.

   Required local values include commercetools project/client settings and Nuvei merchant settings:

   ```dotenv
   CTP_PROJECT_KEY=your-project-key
   CTP_CLIENT_ID=your-client-id
   CTP_CLIENT_SECRET=your-client-secret
   CTP_AUTH_URL=https://auth.europe-west1.gcp.commercetools.com
   CTP_API_URL=https://api.europe-west1.gcp.commercetools.com
   CTP_SESSION_URL=https://session.europe-west1.gcp.commercetools.com/
   CTP_CHECKOUT_URL=https://checkout.europe-west1.gcp.commercetools.com
   CTP_JWKS_URL=https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json
   CTP_JWT_ISSUER=https://mc-api.europe-west1.gcp.commercetools.com
   NUVEI_ENV=test
   NUVEI_MERCHANT_ID=your-merchant-id
   NUVEI_MERCHANT_SITE_ID=your-merchant-site-id
   NUVEI_SECRET_KEY=your-secret-key
   NUVEI_API_BASE_URL=https://sandbox.nuvei.com
   ```

   <!-- VERIFY: Confirm the Nuvei API base URL and merchant credentials for the target Nuvei account before running against a real environment. -->

   Web SDK BLIK is available by default. Use PLN carts with Polish billing/shipping country and a Nuvei merchant account where BLIK is enabled when testing that path.

4. Build both Connect applications before validating or packaging the connector:

   ```bash
   npm run build --prefix enabler
   npm run build --prefix processor
   ```

5. Start the development processes you need:

   ```bash
   npm run dev --prefix enabler
   npm run dev --prefix processor
   npm start --prefix examples/nuvei-web-ui
   ```

   `enabler` starts Vite, `processor` starts Fastify through `tsx`, and `examples/nuvei-web-ui` starts the local Express mock server from `examples/nuvei-web-ui/mock-commercetools-server.mjs`.

## Build commands

Run all commands from the repository root.

| Command | Description |
| --- | --- |
| `npm install --prefix enabler` | Install the frontend enabler dependencies for development. |
| `npm install --prefix processor` | Install the backend processor dependencies for development. |
| `npm install --prefix examples/nuvei-web-ui` | Install the browser evidence harness dependencies for development. |
| `npm run build --prefix enabler` | Run `tsc` and `vite build`; writes the browser bundle to `enabler/public/connector-enabler.es.js` and `enabler/public/connector-enabler.umd.js`. |
| `npm run dev --prefix enabler` | Start the Vite development server for the enabler package. |
| `npm run start --prefix enabler` | Serve `enabler/public` on port 8080 with CORS enabled. |
| `npm run preview --prefix enabler` | Start Vite preview for the enabler build. |
| `npm run serve --prefix enabler` | Build the enabler, then serve `enabler/public` on port 3000 with CORS enabled. |
| `npm run test --prefix enabler` | Run enabler Vitest tests through `enabler/scripts/run-vitest.mjs`. Additional arguments are passed to `vitest run`. |
| `npm run build --prefix processor` | Remove `processor/dist` and compile processor TypeScript with `tsc`. |
| `npm run dev --prefix processor` | Start the processor service from `processor/src/index.ts` with `tsx`. |
| `npm start --prefix processor` | Start the compiled processor entry point at `processor/dist/index.js`. Run the processor build first. |
| `npm run test --prefix processor` | Run processor Vitest tests through `processor/scripts/run-vitest.mjs`. Additional arguments are passed to `vitest run`. |
| `npm run connector:post-deploy --prefix processor` | Run the Connect post-deploy script from `processor/dist/connectors/post-deploy.js`. Build the processor first. |
| `npm run connector:pre-undeploy --prefix processor` | Run the Connect pre-undeploy script from `processor/dist/connectors/pre-undeploy.js`. Build the processor first. |
| `npm start --prefix examples/nuvei-web-ui` | Start the local mocked commercetools/Nuvei test server. |
| `npm install --global @commercetools/cli@0.0.17` | Install the same commercetools CLI version used by CI. |
| `commercetools connect validate .` | Validate `connect.yaml` and the Connect application descriptor from the repository root. |

## Code style

- TypeScript is compiled in strict mode for both packages. `enabler/tsconfig.json` targets ES2022 with DOM types and bundler module resolution; `processor/tsconfig.json` targets ES2022 with NodeNext module resolution.
- `.oxlintrc.json` enables the `typescript` and `unicorn` plugins. No package declares an Oxlint npm script or Oxlint dependency, so there is no repository-pinned lint command.
- No ESLint, Prettier, Biome, or EditorConfig configuration file is present in the repository.
- Formatting in the current source uses two-space indentation in JSON/YAML and TypeScript files, double quotes in most TypeScript source files, and semicolons.
- CI currently validates dependency installation and the commercetools Connect descriptor; it does not run lint, format, build, or test commands.

Before opening a PR, run the checks that cover your change:

```bash
npm run build --prefix enabler
npm run test --prefix enabler
npm run build --prefix processor
npm run test --prefix processor
commercetools connect validate .
```

Run only the package-specific build or test command when your change is isolated to one package, but validate the connector descriptor whenever `connect.yaml`, package scripts, deployment shape, or configuration keys change.

## Branch conventions

The repository's active branch is `main`, and `.github/workflows/connect-validate.yml` runs on pushes to `main` and on pull requests. No branch naming convention is documented in `README.md`, `.github/`, or a `CONTRIBUTING.md` file.

Use short, descriptive branch names that make the change obvious to reviewers, for example `fix/payment-confirmation-validation` or `docs/development-guide`. Treat `main` as the integration branch.

## PR process

There is no checked-in pull request template. Use this repository-specific process for changes:

- Open pull requests against `main`.
- Describe the affected package or area: `enabler`, `processor`, `examples/nuvei-web-ui`, `connect.yaml`, or `docs`.
- Include the exact commands you ran locally, especially package builds, package tests, and `commercetools connect validate .` when the Connect descriptor or deployment behavior changes.
- Do not include Nuvei keys, commercetools client secrets, local `.env` values, or deployment-only URLs in the PR body, screenshots, logs, or fixtures.
- Wait for the `Connect validation` GitHub Actions workflow to pass. The workflow installs enabler and processor dependencies with Node.js 20, installs `@commercetools/cli@0.0.17`, and runs `commercetools connect validate .`.
- If the change affects payment behavior, include the relevant manual verification path from `examples/nuvei-web-ui/` or the affected automated Vitest files so reviewers can reproduce the scenario.
