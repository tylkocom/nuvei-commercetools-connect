<!-- generated-by: gsd-doc-writer -->
# Testing Guide

This repository has separate test suites for the browser enabler, the backend processor, and a local mocked commercetools harness for exercising connector flows without a real commercetools project.

## Test framework and setup

Both application packages use Vitest with TypeScript:

| Package | Framework | Version | Config | Environment | Test include pattern |
| --- | --- | --- | --- | --- | --- |
| `enabler/` | Vitest | `^4.1.5` | `enabler/vitest.config.ts` | `node` | `test/**/*.test.ts` |
| `processor/` | Vitest | `^4.1.5` | `processor/vitest.config.ts` | `node` | `test/**/*.test.ts` |

Both packages also include `@vitest/coverage-v8` `^4.1.5`, but coverage thresholds are not configured.

Install dependencies before running tests:

```bash
npm ci --prefix enabler
npm ci --prefix processor
```

The GitHub validation workflow uses Node.js 20. No root-level `package.json` or workspace test command exists, so run package commands with `--prefix` from the repository root.

## Running tests

Run the full enabler suite:

```bash
npm run test --prefix enabler
```

Run the full processor suite:

```bash
npm run test --prefix processor
```

Run both package suites from the repository root:

```bash
npm run test --prefix enabler
npm run test --prefix processor
```

Run one processor test file:

```bash
npm run test --prefix processor -- test/unit/routes/nuvei-payment.route.test.ts
```

Run one enabler test file:

```bash
npm run test --prefix enabler -- test/unit/payment-enabler.test.ts
```

Run a processor test subset by directory:

```bash
npm run test --prefix processor -- test/unit/services
```

Run a Vitest watch session for a package:

```bash
npm exec --prefix processor -- vitest --watch
npm exec --prefix enabler -- vitest --watch
```

Generate a local coverage report:

```bash
npm run test --prefix processor -- --coverage
npm run test --prefix enabler -- --coverage
```

`enabler/scripts/run-vitest.mjs` and `processor/scripts/run-vitest.mjs` wrap `vitest run` and forward most CLI arguments. They also translate legacy `--coverageReporters` arguments to Vitest's `--coverage.reporter` form.

## Writing new tests

Use `*.test.ts` files under each package's `test/` directory. The Vitest configs do not include source co-located tests, so new test files should stay under `enabler/test/` or `processor/test/` unless the config is intentionally changed.

Current test layout:

```text
enabler/test/unit/
  api-service.test.ts
  card.test.ts
  dropin.test.ts
  nuvei-sdk.test.ts
  payment-enabler.test.ts

processor/test/unit/
  clients/nuvei.client.test.ts
  contract/payment-method-contract.test.ts
  fixtures/dmn.fixtures.ts
  routes/dmn-webhook.route.test.ts
  routes/nuvei-payment.route.test.ts
  routes/operation.route.test.ts
  routes/webhook.route.test.ts
  services/ct-payment-creation.service.test.ts
  services/dmn-processing.service.test.ts
  services/nuvei-event.converter.test.ts
  services/nuvei-payment.service.test.ts
```

Recommended patterns from the existing suites:

- Import test APIs from `vitest`: `describe`, `it`, `expect`, `vi`, and lifecycle hooks such as `beforeEach` or `afterEach`.
- Use `vi.mock(...)` for external modules before importing the class or route under test.
- Use `vi.hoisted(...)` when mock functions need to be referenced inside mock factories and assertions.
- Use `vi.stubGlobal(...)` and `vi.unstubAllGlobals()` for browser globals such as `fetch`.
- Prefer small test helpers such as `makeEnablerOptions()`, `makeReply()`, `buildFastifyApp()`, and `createService()` to keep individual cases focused on behavior.
- For Fastify routes, use `fastify.inject(...)` when validating request/response behavior at the framework boundary.
- For Nuvei DMN scenarios, reuse or extend `processor/test/unit/fixtures/dmn.fixtures.ts` instead of duplicating webhook payloads inline.

Focus new tests on externally visible behavior and invariants that can break payment processing:

| Area | What to cover |
| --- | --- |
| Enabler option validation | Invalid processor URLs, missing session or merchant fields, safe public errors without leaking secrets. |
| Payment method registry | Supported method ordering and parity between enabler and processor advertised methods. |
| Browser SDK loading | Duplicate script avoidance, SDK load failure handling, and callback behavior. |
| Processor payment routes | Safe errors for unsupported methods, schema boundaries, successful session creation responses. |
| Payment operations | Authorization, capture, cancel, reverse, refund, partial amounts, and over-refund protection. |
| DMN processing | Checksum validation, duplicate notifications, amount/currency mismatch rejection, missing payment correlation. |
| Nuvei client | Request signing, checksum validation, Nuvei status mapping, transport error handling. |

## Coverage requirements

No coverage threshold is configured in `enabler/vitest.config.ts`, `processor/vitest.config.ts`, package-level `package.json` files, or a separate coverage config file in this repository.

| Type | Threshold |
| --- | --- |
| Lines | No coverage threshold configured. |
| Branches | No coverage threshold configured. |
| Functions | No coverage threshold configured. |
| Statements | No coverage threshold configured. |

Coverage can still be generated locally with Vitest's V8 provider because both packages install `@vitest/coverage-v8`:

```bash
npm run test --prefix processor -- --coverage
npm run test --prefix enabler -- --coverage
```

Before adding a threshold, make sure both package suites have stable coverage for route errors, DMN edge cases, and enabler browser callback paths.

## CI integration

CI is defined in `.github/workflows/connect-validate.yml`.

| Workflow | Trigger | Job | Test command |
| --- | --- | --- | --- |
| `Connect validation` | Pull requests, pushes to `main`, and manual `workflow_dispatch` | `validate-connect-app` | No test command is run. |

The workflow currently performs these steps:

1. Checks out the repository.
2. Sets up Node.js `20` with npm cache entries for `enabler/package-lock.json` and `processor/package-lock.json`.
3. Runs `npm ci --prefix enabler`.
4. Runs `npm ci --prefix processor`.
5. Installs `@commercetools/cli@0.0.17` globally.
6. Runs `commercetools connect validate .`.

Because CI validates the Connect descriptor but does not run Vitest, run both package test suites locally before opening or merging changes.

## Static quality gate

Before manual payment testing, run the same baseline described in `docs/TEST_SCENARIOS.md`:

```bash
npm run test --prefix processor
npm run build --prefix processor
npm run test --prefix enabler
npm run build --prefix enabler
```

Expected results:

- Processor tests pass.
- Processor TypeScript build succeeds.
- Enabler tests pass.
- Enabler TypeScript and Vite build succeeds.
- `enabler/public/connector-enabler.es.js` and `enabler/public/connector-enabler.umd.js` are generated by the enabler build.

## Local mocked commercetools harness

The `testing/` package provides an Express mock server and browser test page for local connector testing:

| File | Purpose |
| --- | --- |
| `testing/mock-commercetools-server.mjs` | Mock server with a local cart/payment ledger and connector-like endpoints. |
| `testing/nuvei-local-mock-ct-test.html` | Browser test page for exercising enabler flows against a local processor or mock endpoints. |
| `testing/nuvei-local-mock-ct-test.md` | Detailed local test procedure and expected observations. |
| `testing/postman-local-mock-ct.environment.json` | Postman environment for local mock testing. |
| `testing/postman-nuvei-connector-local-testing.collection.json` | Postman collection for connector endpoint testing. |

Install and start the harness:

```bash
npm ci --prefix testing
npm start --prefix testing
```

The mock server defaults to port `8089` and exposes:

```text
GET  /
GET  /ledger
POST /reset
GET  /config
GET  /payment-components
POST /payments/session
POST /payments/confirm/:id
POST /webhooks/nuvei
POST /payment-intents/:id
```

The fixed mock IDs are:

| Item | Value |
| --- | --- |
| Cart ID | `cart-local-001` |
| Payment ID | `payment-local-001` |
| Amount | `10.00` |
| Currency | `EUR` |

Use the harness to verify connector behavior while watching browser DevTools, processor logs, tunnel inspector output, `/ledger`, and the Nuvei sandbox dashboard.

## Manual sandbox scenarios

`docs/TEST_SCENARIOS.md` is the source of truth for end-to-end functional scenarios. It covers static validation, configuration and status endpoints, supported payment components, card and drop-in authorization, 3DS, declines, capture, partial capture, cancel, refund, partial refund, reverse, DMN idempotency, invalid checksums, payment correlation failures, amount/currency mismatch, session auth rejection, Nuvei outage handling, custom storefront usage, deployment scripts, and documentation readiness.

For each manual scenario, record:

- Checkout mode: Complete Checkout, Payment Only, or custom storefront.
- Cart ID, Payment ID, Order ID if created, Nuvei session token, and Nuvei transaction ID.
- Browser result: success, decline, challenge, redirect, or error.
- commercetools Payment transactions before and after DMN processing.
- Nuvei dashboard transaction state.
- Processor log excerpt for the request path.

Use Nuvei sandbox test cards from Nuvei's current sandbox documentation. Do not hard-code production credentials or production card data in tests or documentation.

<!-- VERIFY: Confirm the current Nuvei sandbox card numbers and 3DS challenge cards against the Nuvei testing-card documentation before executing payment scenarios, because external sandbox test data can change outside this repository. -->
