# Technology Stack

**Analysis Date:** 2026-06-02

## Languages

**Primary:**
- TypeScript 6.0.3 - Application source in `processor/src/**/*.ts` and `enabler/src/**/*.ts`; package builds are configured by `processor/tsconfig.json` and `enabler/tsconfig.json`.
- JavaScript ES modules - Local testing harness in `testing/mock-commercetools-server.mjs`; package helper scripts are referenced from `processor/package.json` and `enabler/package.json`.

**Secondary:**
- YAML - commercetools Connect deployment descriptor in `connect.yaml` and CI workflow in `.github/workflows/connect-validate.yml`.
- Markdown - Project and operations documentation in `README.md` and `docs/*.md`.

## Runtime

**Environment:**
- Node.js 20 - CI sets `node-version: '20'` in `.github/workflows/connect-validate.yml`; processor runtime starts with `node dist/index.js` from `processor/package.json`.
- ECMAScript modules - `processor/package.json`, `enabler/package.json`, and `testing/package.json` all set `type: module`.
- Browser DOM runtime - The enabler bundle targets browser checkout pages and loads `window.SafeCharge` from the Nuvei CDN in `enabler/src/services/nuvei-sdk.ts`.

**Package Manager:**
- npm - Package-local installs are used by `README.md`, `docs/DEPLOYMENT.md`, and `.github/workflows/connect-validate.yml` with `npm ci --prefix enabler` and `npm ci --prefix processor`.
- Lockfile: present for all packages: `processor/package-lock.json`, `enabler/package-lock.json`, and `testing/package-lock.json`.
- No root workspace package: there is no root `package.json`; run commands with `--prefix` as documented in `README.md`.
- `processor/bun.lock` and `enabler/bun.lock` are present in the working tree, but `.gitignore` ignores `bun.lock` and no package script or CI workflow uses Bun.

## Frameworks

**Core:**
- Fastify 5.8.5 - Processor HTTP service in `processor/src/server/server.ts`; routes are registered through `processor/src/server/plugins/*.ts`.
- Vite 8.0.10 - Enabler browser library bundling in `enabler/vite.config.ts`; outputs `enabler/public/connector-enabler.es.js` and `enabler/public/connector-enabler.umd.js`.
- Express 4.18.3 - Local manual testing server in `testing/mock-commercetools-server.mjs`.
- commercetools Connect - Deployment model declared in `connect.yaml` with `enabler` as an `assets` application and `processor` as a `service` application.

**Testing:**
- Vitest 4.1.5 - Unit test runner configured by `processor/vitest.config.ts` and `enabler/vitest.config.ts`.
- `@vitest/coverage-v8` 4.1.5 - Coverage provider dependency in `processor/package.json` and `enabler/package.json`.

**Build/Dev:**
- TypeScript compiler 6.0.3 - `processor/package.json` builds with `tsc`; `enabler/package.json` builds with `tsc && vite build`.
- tsx 4.21.0 - Processor development runner via `npm run dev --prefix processor` in `processor/package.json`.
- `serve` 14.2.6 - Static serving of the built enabler assets via `enabler/package.json` scripts.
- OXLint config - `.oxlintrc.json` enables `typescript` and `unicorn` plugins; no package script invokes it.
- commercetools CLI 0.0.17 - CI installs it globally and runs `commercetools connect validate .` in `.github/workflows/connect-validate.yml`.

## Key Dependencies

**Critical:**
- `@commercetools/connect-payments-sdk` ^0.28.0 - Processor authentication hooks, payment SDK setup, commercetools Cart/Payment/Order services, status handler, and permission checks in `processor/src/payment-sdk.ts`, `processor/src/routes/*.ts`, and `processor/src/services/*.ts`.
- `@commercetools/platform-sdk` ^8.25.0 - commercetools platform types used in `processor/src/services/nuvei-payment.service.ts` and `processor/src/services/payment-converter.ts`.
- `@commercetools/sdk-client-v2` ^3.4.0 - SDK client dependency for commercetools API access through the Connect Payments SDK in `processor/package.json`.
- Fastify 5.8.5 - Processor server runtime in `processor/src/server/server.ts`.
- Nuvei SafeCharge Web SDK - Browser script loaded from `https://cdn.safecharge.com/safecharge_resources/v1/websdk/safecharge.js` by `enabler/src/services/nuvei-sdk.ts` with subresource integrity.

**Infrastructure:**
- `@fastify/autoload` ^6.3.1 - Autoloads processor route plugins from `processor/src/server/plugins` in `processor/src/server/server.ts`.
- `@fastify/cors` ^11.2.0 - CORS allowlist in `processor/src/server/server.ts` based on `CTP_CHECKOUT_URL` and `CORS_ALLOWED_ORIGINS`.
- `@fastify/formbody` ^8.0.2 - Parses `application/x-www-form-urlencoded` bodies in `processor/src/server/server.ts`.
- `@fastify/request-context` ^6.2.1 - Request-scoped context in `processor/src/libs/fastify/context/context.ts`.
- `@fastify/type-provider-typebox` ^6.1.0 and `@sinclair/typebox` ^0.34.49 - Route DTO/schema validation in `processor/src/routes/*.ts` and `processor/src/dtos/**/*.ts`.
- `fastify-plugin` ^5.1.0 - Request context plugin wrapper in `processor/src/libs/fastify/context/context.ts`.
- `fastify-raw-body` ^5.0.0 - Raw body capture for `POST /webhooks/nuvei` in `processor/src/server/server.ts`.
- `dotenv` ^17.4.2 - Local environment loading in `processor/src/index.ts`.
- Node built-ins `node:crypto`, `node:path`, `node:url` - Request IDs, checksum signing, URL normalization, and plugin path setup in `processor/src/clients/nuvei.client.ts`, `processor/src/server/server.ts`, and `testing/mock-commercetools-server.mjs`.

## Configuration

**Environment:**
- Runtime config is assembled in `processor/src/config/config.ts` from process environment variables and validated before server start in `processor/src/index.ts`.
- Deployment configuration keys are declared in `connect.yaml`. Standard configuration includes `CTP_PROJECT_KEY`, commercetools URLs, `NUVEI_ENV`, Nuvei merchant IDs, `NUVEI_API_BASE_URL`, `NUVEI_DMN_CHECKSUM_ALGORITHM`, and `CORS_ALLOWED_ORIGINS`.
- Secured deployment configuration in `connect.yaml` includes `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, and `NUVEI_SECRET_KEY`.
- Local dotenv files exist at `.env` and `processor/.env`; treat contents as secret-bearing environment configuration and do not quote values.
- URL validation in `processor/src/config/config.ts` requires HTTPS for commercetools endpoints, Nuvei API base URL, optional `RETURN_URL`, and configured CORS origins.

**Build:**
- `processor/tsconfig.json` targets `ES2022`, uses `NodeNext` modules/resolution, emits declarations and JavaScript to `processor/dist`, and enables `strict`.
- `enabler/tsconfig.json` targets `ES2022`, uses `ESNext` modules with bundler resolution, includes `DOM` libs, emits declarations to `enabler/dist`, and enables `strict`.
- `enabler/vite.config.ts` builds a library from `enabler/src/main.ts` to `enabler/public` in ES and UMD formats.
- `processor/vitest.config.ts` and `enabler/vitest.config.ts` run Node-environment tests matching `test/**/*.test.ts`.
- `connect.yaml` defines processor lifecycle scripts `connector:post-deploy` and `connector:pre-undeploy`, implemented by `processor/src/connectors/post-deploy.ts` and `processor/src/connectors/pre-undeploy.ts`.

## Platform Requirements

**Development:**
- Install package dependencies independently with `npm ci --prefix enabler`, `npm ci --prefix processor`, and `npm ci --prefix testing` as documented in `README.md`.
- Build with `npm run build --prefix enabler` and `npm run build --prefix processor`; validate the Connect descriptor with `commercetools connect validate .` as shown in `docs/DEPLOYMENT.md`.
- Processor local development uses `npm run dev --prefix processor`, which starts `processor/src/index.ts` through `tsx`.
- Enabler local development uses `npm run dev --prefix enabler`, which starts Vite from `enabler/package.json`.
- Optional local mock testing uses `npm start --prefix testing`, starting `testing/mock-commercetools-server.mjs` on port `8089` by default.

**Production:**
- Deployed as a commercetools Connect connector with `enabler` as an assets application and `processor` as a service application declared in `connect.yaml`.
- Processor listens on `0.0.0.0` using `PORT` from `processor/src/config/config.ts`, defaulting to `8080`.
- No Dockerfile, Docker Compose, Serverless Framework, Vercel, Netlify, Fly.io, or Railway deployment config is present; `docs/DEPLOYMENT.md` identifies `connect.yaml` as the runtime deployment descriptor.
- CI in `.github/workflows/connect-validate.yml` validates the Connect app but does not deploy it.

---

*Stack analysis: 2026-06-02*
