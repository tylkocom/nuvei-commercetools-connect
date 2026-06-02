# Codebase Structure

**Analysis Date:** 2026-06-02

## Directory Layout

```text
[project-root]/
├── connect.yaml                         # commercetools Connect descriptor for assets + service applications
├── README.md                            # Repository overview, commands, runtime behavior, and usage examples
├── docs/                                # Human-facing project, operations, architecture, configuration, and testing docs
│   ├── ARCHITECTURE.md                  # Detailed connector architecture documentation
│   ├── CONFIGURATION.md                 # Runtime configuration reference
│   ├── DEPLOYMENT.md                    # Deployment instructions
│   ├── DEVELOPMENT.md                   # Development workflow documentation
│   ├── GETTING-STARTED.md               # Onboarding and quick-start documentation
│   ├── TESTING.md                       # Testing documentation
│   └── TEST_SCENARIOS.md                # Manual and scenario test coverage
├── enabler/                             # Browser assets application built as a Vite library
│   ├── package.json                     # Enabler package scripts and dependencies
│   ├── package-lock.json                # npm lockfile for enabler
│   ├── bun.lock                         # Bun lockfile present for enabler dependencies
│   ├── tsconfig.json                    # Browser/DOM TypeScript compiler options
│   ├── vite.config.ts                   # Library build to `enabler/public/connector-enabler.*.js`
│   ├── vitest.config.ts                 # Enabler Vitest configuration
│   ├── public/                          # Generated Connect assets bundle output
│   │   ├── connector-enabler.es.js      # Generated ES module bundle
│   │   └── connector-enabler.umd.js     # Generated UMD bundle
│   ├── scripts/
│   │   └── run-vitest.mjs               # Test runner wrapper
│   ├── src/
│   │   ├── main.ts                      # Vite library entry exporting `Enabler`
│   │   ├── index.ts                     # Public TypeScript API entry
│   │   ├── payment-enabler/             # Public frontend contracts and method registry
│   │   ├── components/                  # Individual component implementations such as card
│   │   ├── dropin/                      # Drop-in implementations such as embedded Nuvei widget
│   │   └── services/                    # Browser effect adapters for processor API and SafeCharge SDK
│   └── test/
│       └── unit/                        # Enabler unit tests colocated by behavior area
├── processor/                           # Fastify service application for Connect payment processing
│   ├── package.json                     # Processor package scripts and dependencies
│   ├── package-lock.json                # npm lockfile for processor
│   ├── bun.lock                         # Bun lockfile present for processor dependencies
│   ├── tsconfig.json                    # NodeNext TypeScript compiler options
│   ├── vitest.config.ts                 # Processor Vitest configuration
│   ├── scripts/
│   │   └── run-vitest.mjs               # Test runner wrapper
│   ├── src/
│   │   ├── index.ts                     # Processor runtime bootstrap
│   │   ├── global.d.ts                  # Global type augmentation
│   │   ├── payment-sdk.ts               # commercetools Connect Payments SDK composition
│   │   ├── constants.ts                 # Shared processor constants
│   │   ├── clients/                     # External API clients
│   │   ├── config/                      # Runtime configuration and validation
│   │   ├── connectors/                  # Connect lifecycle scripts
│   │   ├── dtos/                        # TypeBox HTTP schemas and DTO types
│   │   ├── libs/                        # Shared infrastructure: Fastify helpers and logger
│   │   ├── routes/                      # Fastify route modules
│   │   ├── server/                      # Fastify setup, app singleton, and plugin registration
│   │   └── services/                    # Payment orchestration and conversion logic
│   └── test/
│       └── unit/                        # Processor unit and route tests by architecture layer
├── testing/                             # Local manual/integration harness with mock server and Postman assets
│   ├── package.json                     # Harness start script and Express dependency
│   ├── package-lock.json                # npm lockfile for testing harness
│   ├── mock-commercetools-server.mjs    # Local Express mock server
│   ├── nuvei-local-mock-ct-test.html    # Browser manual test page
│   ├── nuvei-local-mock-ct-test.md      # Harness usage guide
│   ├── postman-local-mock-ct.environment.json # Postman local environment
│   └── postman-nuvei-connector-local-testing.collection.json # Postman collection
├── .github/
│   └── workflows/
│       └── connect-validate.yml         # CI workflow validating the Connect app
├── .planning/                           # GSD planning and generated codebase intelligence
│   └── codebase/                        # Codebase maps consumed by planning/execution commands
├── .oxlintrc.json                       # Oxlint configuration
├── .gitignore                           # Git ignore rules
├── .env                                 # Environment configuration present; contents must not be read or committed
└── processor/.env                       # Processor environment configuration present; contents must not be read or committed
```

## Directory Purposes

**Project root `.`:**
- Purpose: Holds the Connect descriptor, top-level documentation, package subprojects, local testing harness, CI configuration, and planning artifacts.
- Contains: `connect.yaml`, `README.md`, `docs/`, `enabler/`, `processor/`, `testing/`, `.github/`, `.planning/`.
- Key files: `connect.yaml`, `README.md`, `.github/workflows/connect-validate.yml`, `.oxlintrc.json`.

**`docs/`:**
- Purpose: Maintain human-readable project documentation for architecture, configuration, deployment, development, testing, and manual scenarios.
- Contains: Markdown files only.
- Key files: `docs/ARCHITECTURE.md`, `docs/CONFIGURATION.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `docs/TEST_SCENARIOS.md`.

**`enabler/`:**
- Purpose: Browser-side commercetools Connect assets application for rendering Nuvei Simply Connect widgets.
- Contains: Vite library build configuration, TypeScript source, generated public assets, unit tests, package files, and test script wrapper.
- Key files: `enabler/package.json`, `enabler/vite.config.ts`, `enabler/tsconfig.json`, `enabler/src/index.ts`, `enabler/src/main.ts`.

**`enabler/src/`:**
- Purpose: Source root for the browser enabler public API, UI adapters, and browser service adapters.
- Contains: Public entry points, payment-enabler contracts, card component, embedded drop-in, API service, SafeCharge SDK loader.
- Key files: `enabler/src/index.ts`, `enabler/src/main.ts`, `enabler/src/payment-enabler/payment-enabler.ts`, `enabler/src/payment-enabler/method-registry.ts`.

**`enabler/src/payment-enabler/`:**
- Purpose: Define the frontend-facing payment enabler API and supported method metadata.
- Contains: Interfaces, enums, runtime validation, public error types, method registry helpers.
- Key files: `enabler/src/payment-enabler/payment-enabler.ts`, `enabler/src/payment-enabler/method-registry.ts`.

**`enabler/src/components/`:**
- Purpose: Hold individual payment component implementations.
- Contains: Component builder and mountable component classes.
- Key files: `enabler/src/components/card.ts`.

**`enabler/src/dropin/`:**
- Purpose: Hold full drop-in payment UI implementations.
- Contains: Drop-in builder and mountable embedded drop-in component.
- Key files: `enabler/src/dropin/dropin-embedded.ts`.

**`enabler/src/services/`:**
- Purpose: Isolate browser-side external effects from component classes.
- Contains: Processor API client, payment confirmation helper, Nuvei SafeCharge SDK loader.
- Key files: `enabler/src/services/api-service.ts`, `enabler/src/services/nuvei-sdk.ts`.

**`enabler/public/`:**
- Purpose: Store generated browser bundle assets for the Connect assets application.
- Contains: Vite library output files.
- Key files: `enabler/public/connector-enabler.es.js`, `enabler/public/connector-enabler.umd.js`.

**`enabler/test/unit/`:**
- Purpose: Test browser enabler behavior with Vitest.
- Contains: Unit tests for public API, card component, drop-in component, API service, and SDK loader.
- Key files: `enabler/test/unit/payment-enabler.test.ts`, `enabler/test/unit/card.test.ts`, `enabler/test/unit/dropin.test.ts`, `enabler/test/unit/api-service.test.ts`, `enabler/test/unit/nuvei-sdk.test.ts`.

**`processor/`:**
- Purpose: Server-side commercetools Connect service application for payment sessions, operation endpoints, and Nuvei DMN processing.
- Contains: TypeScript source, tests, package files, config files, and test script wrapper.
- Key files: `processor/package.json`, `processor/tsconfig.json`, `processor/vitest.config.ts`, `processor/src/index.ts`.

**`processor/src/`:**
- Purpose: Source root for the Fastify processor service.
- Contains: Runtime entry point, Connect SDK setup, constants, config, clients, DTOs, routes, services, server setup, shared libs, lifecycle scripts.
- Key files: `processor/src/index.ts`, `processor/src/payment-sdk.ts`, `processor/src/constants.ts`, `processor/src/global.d.ts`.

**`processor/src/clients/`:**
- Purpose: Contain external API clients used by server-side services.
- Contains: Nuvei API client with signing, timeout, endpoint, and checksum behavior.
- Key files: `processor/src/clients/nuvei.client.ts`.

**`processor/src/config/`:**
- Purpose: Centralize runtime configuration and startup validation.
- Contains: Environment variable parsing, defaults, required value checks, HTTPS URL validation.
- Key files: `processor/src/config/config.ts`.

**`processor/src/connectors/`:**
- Purpose: Contain commercetools Connect lifecycle scripts invoked by deployment hooks.
- Contains: Post-deploy and pre-undeploy TypeScript scripts.
- Key files: `processor/src/connectors/post-deploy.ts`, `processor/src/connectors/pre-undeploy.ts`.

**`processor/src/dtos/`:**
- Purpose: Define route validation schemas and DTO types.
- Contains: Nuvei payment schemas and operation-specific schemas under `processor/src/dtos/operations/`.
- Key files: `processor/src/dtos/nuvei-payment.dto.ts`, `processor/src/dtos/operations/payment-components.dto.ts`, `processor/src/dtos/operations/payment-errors.dto.ts`, `processor/src/dtos/operations/payment-intents.dto.ts`, `processor/src/dtos/operations/transaction.dto.ts`.

**`processor/src/dtos/operations/`:**
- Purpose: Hold Connect operation endpoint schemas and DTOs.
- Contains: Config response, payment components, public payment errors, payment intent requests/responses, status response, transaction request/response.
- Key files: `processor/src/dtos/operations/config.dto.ts`, `processor/src/dtos/operations/status.dto.ts`, `processor/src/dtos/operations/payment-components.dto.ts`, `processor/src/dtos/operations/payment-intents.dto.ts`, `processor/src/dtos/operations/transaction.dto.ts`.

**`processor/src/libs/`:**
- Purpose: Hold shared infrastructure helpers that are not business services.
- Contains: Fastify request context, error handler, Nuvei DMN auth hook, error DTOs, logger wrapper.
- Key files: `processor/src/libs/fastify/context/context.ts`, `processor/src/libs/fastify/error-handler.ts`, `processor/src/libs/fastify/hooks/nuvei-header-auth.hook.ts`, `processor/src/libs/logger/index.ts`.

**`processor/src/routes/`:**
- Purpose: Map HTTP endpoints to service operations with auth hooks, schemas, and response status codes.
- Contains: Connect operation routes and Nuvei payment/webhook routes.
- Key files: `processor/src/routes/operation.route.ts`, `processor/src/routes/nuvei-payment.route.ts`.

**`processor/src/server/`:**
- Purpose: Compose Fastify, plugins, and application services.
- Contains: Server factory, app singleton, autoloaded plugin modules.
- Key files: `processor/src/server/server.ts`, `processor/src/server/app.ts`, `processor/src/server/plugins/operation.plugin.ts`, `processor/src/server/plugins/nuvei-payment.plugin.ts`.

**`processor/src/server/plugins/`:**
- Purpose: Register route groups with Fastify autoload.
- Contains: Operation plugin and Nuvei payment/webhook plugin.
- Key files: `processor/src/server/plugins/operation.plugin.ts`, `processor/src/server/plugins/nuvei-payment.plugin.ts`.

**`processor/src/services/`:**
- Purpose: Implement payment business logic and vendor/commercetools orchestration.
- Contains: Abstract payment operation dispatch, Nuvei payment service, commercetools payment creation service, DMN converter, transaction converter, service operation types.
- Key files: `processor/src/services/nuvei-payment.service.ts`, `processor/src/services/abstract-payment.service.ts`, `processor/src/services/ct-payment-creation.service.ts`, `processor/src/services/payment-converter.ts`, `processor/src/services/converters/nuvei-event.converter.ts`, `processor/src/services/types/operation.type.ts`.

**`processor/test/unit/`:**
- Purpose: Test processor behavior by layer.
- Contains: Contract tests, route tests, service tests, fixture data, client tests.
- Key files: `processor/test/unit/contract/payment-method-contract.test.ts`, `processor/test/unit/routes/operation.route.test.ts`, `processor/test/unit/routes/nuvei-payment.route.test.ts`, `processor/test/unit/routes/dmn-webhook.route.test.ts`, `processor/test/unit/services/nuvei-payment.service.test.ts`, `processor/test/unit/services/dmn-processing.service.test.ts`, `processor/test/unit/clients/nuvei.client.test.ts`.

**`testing/`:**
- Purpose: Provide a local mock commercetools/Nuvei-compatible harness for manual and Postman testing.
- Contains: Express mock server, HTML test page, Markdown guide, Postman collection/environment, harness package files.
- Key files: `testing/mock-commercetools-server.mjs`, `testing/nuvei-local-mock-ct-test.html`, `testing/nuvei-local-mock-ct-test.md`, `testing/postman-nuvei-connector-local-testing.collection.json`, `testing/postman-local-mock-ct.environment.json`.

**`.github/workflows/`:**
- Purpose: Define repository CI workflows.
- Contains: Connect validation workflow.
- Key files: `.github/workflows/connect-validate.yml`.

**`.planning/codebase/`:**
- Purpose: Store generated codebase maps consumed by GSD planning and execution commands.
- Contains: Architecture and structure maps for this focus, plus maps from other focus areas when generated.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

## Key File Locations

**Entry Points:**
- `connect.yaml`: Connect application descriptor; first file to inspect for deployment topology and required configuration.
- `processor/src/index.ts`: Processor process entry; loads dotenv, validates config, starts Fastify.
- `processor/src/server/server.ts`: Fastify construction and infrastructure plugin setup.
- `processor/src/server/plugins/operation.plugin.ts`: Registers operation endpoints.
- `processor/src/server/plugins/nuvei-payment.plugin.ts`: Registers payment and webhook endpoints.
- `enabler/src/index.ts`: Public TypeScript API entry for browser consumers.
- `enabler/src/main.ts`: Vite library entry exporting `NuveiEnabler` as `Enabler`.
- `testing/mock-commercetools-server.mjs`: Local harness entry.

**Configuration:**
- `connect.yaml`: Connect deployment and environment variable declarations.
- `processor/src/config/config.ts`: Runtime environment parsing and validation.
- `processor/package.json`: Processor scripts and dependencies.
- `enabler/package.json`: Enabler scripts and dependencies.
- `testing/package.json`: Local harness script and dependencies.
- `processor/tsconfig.json`: Processor NodeNext TypeScript compiler options.
- `enabler/tsconfig.json`: Enabler browser TypeScript compiler options.
- `enabler/vite.config.ts`: Browser library output configuration.
- `processor/vitest.config.ts`: Processor test config.
- `enabler/vitest.config.ts`: Enabler test config.
- `.github/workflows/connect-validate.yml`: CI validation workflow.
- `.oxlintrc.json`: Oxlint configuration.

**Core Logic:**
- `processor/src/services/nuvei-payment.service.ts`: Core payment orchestration and invariants.
- `processor/src/services/abstract-payment.service.ts`: Shared payment modification dispatch contract.
- `processor/src/services/ct-payment-creation.service.ts`: commercetools Payment creation and cart attachment.
- `processor/src/clients/nuvei.client.ts`: Nuvei REST API adapter.
- `processor/src/services/converters/nuvei-event.converter.ts`: DMN conversion.
- `processor/src/services/payment-converter.ts`: Nuvei/commercetools transaction mapping.
- `processor/src/payment-sdk.ts`: commercetools SDK setup and request-context bridge.
- `enabler/src/components/card.ts`: Browser card component behavior.
- `enabler/src/dropin/dropin-embedded.ts`: Browser embedded drop-in behavior.
- `enabler/src/services/api-service.ts`: Browser processor API client.
- `enabler/src/services/nuvei-sdk.ts`: Nuvei SafeCharge SDK loader.

**HTTP/API Boundaries:**
- `processor/src/routes/operation.route.ts`: `/config`, `/status`, `/payment-components`, `/payment-intents/:id`, `/transactions`.
- `processor/src/routes/nuvei-payment.route.ts`: `/payments`, `/payments/confirmPayments/:id`, `/webhooks/nuvei`.
- `processor/src/dtos/nuvei-payment.dto.ts`: Payment session and confirmation schemas.
- `processor/src/dtos/operations/*.dto.ts`: Operation endpoint schemas.
- `enabler/src/services/api-service.ts`: Browser-to-processor request shapes.

**Authentication and Context:**
- `processor/src/payment-sdk.ts`: Session, JWT, OAuth2, and authority hook provider.
- `processor/src/libs/fastify/context/context.ts`: Request-scoped authentication and correlation data.
- `processor/src/libs/fastify/hooks/nuvei-header-auth.hook.ts`: DMN checksum presence pre-filter.
- `processor/src/server/server.ts`: CORS and security headers.

**Testing:**
- `processor/test/unit/routes/`: Processor route tests.
- `processor/test/unit/services/`: Processor service and converter tests.
- `processor/test/unit/clients/nuvei.client.test.ts`: Nuvei client tests.
- `processor/test/unit/contract/payment-method-contract.test.ts`: Payment method contract alignment tests.
- `processor/test/unit/fixtures/dmn.fixtures.ts`: DMN fixtures.
- `enabler/test/unit/`: Enabler browser API/component/service tests.
- `testing/`: Manual/local harness assets.

**Generated or Build Output:**
- `enabler/public/connector-enabler.es.js`: Generated ES library bundle.
- `enabler/public/connector-enabler.umd.js`: Generated UMD library bundle.
- `enabler/dist/`: TypeScript declaration output path from `enabler/tsconfig.json` when built; not present in the inspected tree.
- `processor/dist/`: TypeScript output path from `processor/tsconfig.json` when built; not present in the inspected tree.

## Naming Conventions

**Files:**
- Use lowercase kebab-case for most source files: `processor/src/routes/nuvei-payment.route.ts`, `processor/src/services/ct-payment-creation.service.ts`, `enabler/src/payment-enabler/method-registry.ts`.
- Use suffixes that identify architecture role:
  - `.route.ts` for Fastify route modules: `processor/src/routes/operation.route.ts`.
  - `.plugin.ts` for Fastify autoload plugins: `processor/src/server/plugins/operation.plugin.ts`.
  - `.service.ts` for business/domain services: `processor/src/services/nuvei-payment.service.ts`.
  - `.client.ts` for external API clients: `processor/src/clients/nuvei.client.ts`.
  - `.dto.ts` for TypeBox schemas and DTO types: `processor/src/dtos/operations/payment-intents.dto.ts`.
  - `.hook.ts` for Fastify/auth hooks: `processor/src/libs/fastify/hooks/nuvei-header-auth.hook.ts`.
  - `.converter.ts` for mapping logic: `processor/src/services/converters/nuvei-event.converter.ts`.
  - `.test.ts` for Vitest tests: `processor/test/unit/services/nuvei-payment.service.test.ts`.
- Use standard entry names for package entry points: `processor/src/index.ts`, `enabler/src/index.ts`, `enabler/src/main.ts`.
- Use uppercase Markdown for generated codebase maps: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**Directories:**
- Use lowercase feature/layer names: `processor/src/services/`, `processor/src/routes/`, `enabler/src/components/`.
- Use nested role directories only when there is a clear sublayer: `processor/src/dtos/operations/`, `processor/src/services/converters/`, `processor/src/services/types/`, `processor/src/libs/fastify/hooks/`.
- Keep package roots independent: `enabler/`, `processor/`, and `testing/` each own their own `package.json` and lockfile.

**Classes and Types:**
- Use PascalCase for classes and exported type aliases/interfaces: `NuveiEnabler`, `CardComponentBuilder`, `NuveiPaymentService`, `CtPaymentCreationService`, `NuveiClient`, `PaymentResponseSchemaDTO`.
- Use descriptive DTO names ending in `DTO` for TypeBox static types: `PaymentMethodOptionsSchemaDTO`, `StatusResponseSchemaDTO`, `TransactionDraftDTO`.
- Use `Schema` suffix for TypeBox schemas: `PaymentResponseSchema`, `SupportedPaymentComponentsSchema`, `PaymentIntentRequestSchema`.

**Functions and Variables:**
- Use camelCase for functions and local variables: `setupFastify`, `validateConfig`, `getCartIdFromContext`, `createPaymentIntent`, `confirmPaymentResult`.
- Use uppercase snake case for constants: `NUVEI_SDK_URL`, `NUVEI_SDK_INTEGRITY`, `PAYMENT_METHOD_REGISTRY`, `NUVEI_PAYMENT_INTERFACE`.
- Use leading underscore only for private module cache state: `_nuveiClient` in `processor/src/clients/nuvei.client.ts`.

## Where to Add New Code

**New browser payment component:**
- Primary code: Add a new component file under `enabler/src/components/`.
- Public contract wiring: Update `enabler/src/payment-enabler/method-registry.ts` and `enabler/src/index.ts` builder maps.
- Processor advertisement: Update `processor/src/dtos/operations/payment-components.dto.ts`.
- Tests: Add or update tests under `enabler/test/unit/` and `processor/test/unit/contract/payment-method-contract.test.ts`.

**New browser drop-in mode:**
- Primary code: Add a new drop-in file under `enabler/src/dropin/`.
- Public contract wiring: Update `DropinType` in `enabler/src/payment-enabler/payment-enabler.ts`, registry data in `enabler/src/payment-enabler/method-registry.ts`, and `DROPIN_BUILDERS` in `enabler/src/index.ts`.
- Processor advertisement: Update `processor/src/dtos/operations/payment-components.dto.ts`.
- Tests: Add or update `enabler/test/unit/dropin.test.ts` and `processor/test/unit/contract/payment-method-contract.test.ts`.

**New processor endpoint:**
- Primary code: Add route definitions to `processor/src/routes/` when the endpoint belongs to a new route group, or extend `processor/src/routes/operation.route.ts` / `processor/src/routes/nuvei-payment.route.ts` when it belongs to an existing group.
- Plugin registration: Register new route groups from `processor/src/server/plugins/` so `@fastify/autoload` in `processor/src/server/server.ts` discovers them.
- DTOs: Add TypeBox schemas under `processor/src/dtos/` or `processor/src/dtos/operations/`.
- Business logic: Put non-trivial behavior in `processor/src/services/`, not in route handlers.
- Tests: Add route tests under `processor/test/unit/routes/` and service tests under `processor/test/unit/services/`.

**New Nuvei server API operation:**
- Primary code: Add a method to `processor/src/clients/nuvei.client.ts` with checksum/signing fields defined beside existing Nuvei operations.
- Orchestration: Call the client from `processor/src/services/nuvei-payment.service.ts` or a focused service under `processor/src/services/`.
- Tests: Add client coverage under `processor/test/unit/clients/nuvei.client.test.ts` and service behavior under `processor/test/unit/services/`.

**New payment modification behavior:**
- Primary code: Add or change provider-specific behavior in `processor/src/services/nuvei-payment.service.ts`.
- Shared dispatch: Update `processor/src/services/abstract-payment.service.ts` only when the operation contract changes for all providers.
- DTOs: Update `processor/src/dtos/operations/payment-intents.dto.ts` when request/response shape changes.
- Tests: Add service tests under `processor/test/unit/services/nuvei-payment.service.test.ts` and route tests under `processor/test/unit/routes/operation.route.test.ts`.

**New DMN/webhook behavior:**
- Route boundary: Keep the webhook route in `processor/src/routes/nuvei-payment.route.ts` unless adding a distinct webhook family.
- Raw body setup: Update `processor/src/server/server.ts` if the webhook path changes or a new raw-body path is required.
- Pre-filter auth: Update or add hooks under `processor/src/libs/fastify/hooks/`.
- Conversion: Put Nuvei payload parsing in `processor/src/services/converters/nuvei-event.converter.ts` and transaction mapping in `processor/src/services/payment-converter.ts`.
- Orchestration: Keep idempotency, checksum, merchant, and amount/currency validation in `processor/src/services/nuvei-payment.service.ts`.
- Tests: Add fixtures under `processor/test/unit/fixtures/` and tests under `processor/test/unit/routes/` and `processor/test/unit/services/`.

**New commercetools SDK integration:**
- SDK setup: Extend `processor/src/payment-sdk.ts` only when SDK composition, auth hooks, logging, or context bridging changes.
- Business service: Add focused behavior under `processor/src/services/`.
- Context access: Add request-context helpers to `processor/src/libs/fastify/context/context.ts` when the data comes from authenticated request context.
- Tests: Add service tests under `processor/test/unit/services/`.

**New runtime configuration:**
- Runtime parser: Add the environment variable to `processor/src/config/config.ts`.
- Connect declaration: Add deployment-facing configuration to `connect.yaml`.
- Documentation: Update `docs/CONFIGURATION.md` and relevant docs under `docs/`.
- Tests: Add config validation coverage in the relevant processor test area if behavior changes.

**New frontend external effect:**
- Primary code: Add an adapter under `enabler/src/services/`.
- Component usage: Inject or instantiate the adapter from component/drop-in files under `enabler/src/components/` or `enabler/src/dropin/`.
- Tests: Add service tests under `enabler/test/unit/` and component tests where behavior is visible.

**New local testing scenario:**
- Mock behavior: Extend `testing/mock-commercetools-server.mjs`.
- Manual browser flow: Update `testing/nuvei-local-mock-ct-test.html` and `testing/nuvei-local-mock-ct-test.md`.
- Postman coverage: Update `testing/postman-nuvei-connector-local-testing.collection.json` and `testing/postman-local-mock-ct.environment.json`.

**Utilities:**
- Processor shared infrastructure: Use `processor/src/libs/` for Fastify/logger/infrastructure helpers.
- Processor domain helpers: Use `processor/src/services/` or a subdirectory under it for payment-domain helpers.
- Enabler browser helpers: Use `enabler/src/services/` for browser effects; use `enabler/src/payment-enabler/` for public contract helpers.
- Avoid adding a root-level shared package unless both `enabler/` and `processor/` need compiled shared code and the build/deployment model is updated.

## Special Directories

**`enabler/public/`:**
- Purpose: Contains generated browser bundles served by the Connect assets application.
- Generated: Yes, by `npm run build --prefix enabler` through `enabler/vite.config.ts`.
- Committed: Yes, files are present in the inspected tree.

**`enabler/dist/`:**
- Purpose: TypeScript declaration/build output path from `enabler/tsconfig.json`.
- Generated: Yes, by `tsc` during `npm run build --prefix enabler`.
- Committed: Not present in the inspected tree.

**`processor/dist/`:**
- Purpose: Compiled JavaScript output used by `npm start --prefix processor` and Connect lifecycle scripts.
- Generated: Yes, by `npm run build --prefix processor`.
- Committed: Not present in the inspected tree.

**`processor/scripts/` and `enabler/scripts/`:**
- Purpose: Package-local script wrappers.
- Generated: No.
- Committed: Yes.

**`processor/test/unit/` and `enabler/test/unit/`:**
- Purpose: Package-local Vitest unit test suites organized by layer/behavior.
- Generated: No.
- Committed: Yes.

**`testing/`:**
- Purpose: Local manual/integration harness separate from automated unit tests.
- Generated: No.
- Committed: Yes.

**`.planning/`:**
- Purpose: GSD planning state, phase artifacts, and generated codebase intelligence.
- Generated: Yes, by GSD workflows.
- Committed: Project-dependent; `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/STRUCTURE.md` are the deliverables for this mapping task.

**`.github/workflows/`:**
- Purpose: CI workflow definitions.
- Generated: No.
- Committed: Yes.

**`.env` and `processor/.env`:**
- Purpose: Environment configuration files are present.
- Generated: No.
- Committed: Should not be committed when containing real environment values; contents must not be read or quoted.

---

*Structure analysis: 2026-06-02*
