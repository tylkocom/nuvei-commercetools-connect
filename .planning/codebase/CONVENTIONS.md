# Coding Conventions

**Analysis Date:** 2026-06-02

## Naming Patterns

**Files:**
- Use kebab-case for multi-word TypeScript module files: `processor/src/services/ct-payment-creation.service.ts`, `processor/src/routes/nuvei-payment.route.ts`, `processor/src/libs/fastify/error-handler.ts`, `enabler/src/payment-enabler/method-registry.ts`.
- Use suffixes that communicate role for backend modules: `.route.ts` for Fastify route registration (`processor/src/routes/operation.route.ts`), `.service.ts` for service classes (`processor/src/services/nuvei-payment.service.ts`), `.client.ts` for provider clients (`processor/src/clients/nuvei.client.ts`), `.dto.ts` for TypeBox DTO/schema modules (`processor/src/dtos/operations/payment-components.dto.ts`).
- Use package-local `test/unit/**` paths mirroring source areas: `processor/test/unit/routes/nuvei-payment.route.test.ts`, `processor/test/unit/services/nuvei-payment.service.test.ts`, `enabler/test/unit/api-service.test.ts`.
- Keep generated browser bundles under `enabler/public/connector-enabler.es.js` and `enabler/public/connector-enabler.umd.js`; source remains under `enabler/src/`.

**Functions:**
- Use camelCase for functions and methods: `validateEnablerOptions()` in `enabler/src/payment-enabler/payment-enabler.ts`, `loadNuveiSdk()` in `enabler/src/services/nuvei-sdk.ts`, `createPaymentIntent()` in `processor/src/services/nuvei-payment.service.ts`.
- Prefix predicate/type-guard helpers with `is`: `isSupportedPaymentMethod()` in `enabler/src/payment-enabler/method-registry.ts` and `processor/src/dtos/operations/payment-components.dto.ts`, `isPlainObject()` in `processor/src/services/nuvei-payment.service.ts`.
- Prefix accessor helpers with `get`: `getConfig()` in `processor/src/config/config.ts`, `getComponentPaymentMethods()` in `enabler/src/payment-enabler/method-registry.ts`, `getTransactionInteractionId()` in `processor/src/services/nuvei-payment.service.ts`.
- Use action-oriented async method names for external effects: `openOrder()`, `settleTransaction()`, `voidTransaction()`, and `refundTransaction()` in `processor/src/clients/nuvei.client.ts`.

**Variables:**
- Use camelCase for local variables and object properties in TypeScript: `paymentReference`, `sessionToken`, `merchantReturnUrl` in `processor/src/routes/nuvei-payment.route.ts` and `enabler/src/services/api-service.ts`.
- Use UPPER_SNAKE_CASE for exported immutable constants: `NUVEI_SDK_URL` in `enabler/src/services/nuvei-sdk.ts`, `PAYMENT_METHOD_REGISTRY` in `processor/src/dtos/operations/payment-components.dto.ts`, `NUVEI_PAYMENT_INTERFACE` in `processor/src/constants.ts`.
- Use leading underscore only for module-level singleton cache variables: `_nuveiClient` in `processor/src/clients/nuvei.client.ts`.
- Use `mock*` prefixes for test doubles: `mockLoadNuveiSdk` in `enabler/test/unit/card.test.ts`, `mockNuveiClientInstance` in `processor/test/unit/services/nuvei-payment.service.test.ts`, `mockGetPayment` in `processor/test/unit/services/dmn-processing.service.test.ts`.

**Types:**
- Use PascalCase for classes, interfaces, type aliases, and DTO type names: `NuveiPaymentService` in `processor/src/services/nuvei-payment.service.ts`, `NuveiClientConfig` in `processor/src/clients/nuvei.client.ts`, `PaymentResponseSchemaDTO` in `processor/src/dtos/nuvei-payment.dto.ts`.
- Pair TypeBox schemas with `Static<typeof Schema>` DTO aliases in DTO modules: `PaymentResponseSchema`/`PaymentResponseSchemaDTO` in `processor/src/dtos/nuvei-payment.dto.ts`, `SupportedPaymentComponentsSchema`/`SupportedPaymentComponentsSchemaDTO` in `processor/src/dtos/operations/payment-components.dto.ts`.
- Use `as const` plus `satisfies` for registries that need literal inference and shape checking: `PAYMENT_METHOD_REGISTRY` in `enabler/src/payment-enabler/method-registry.ts` and `processor/src/dtos/operations/payment-components.dto.ts`.
- Use string literal unions for constrained public values: `PaymentMethodKind` and `PaymentMethodKey` in `enabler/src/payment-enabler/method-registry.ts`, `PublicPaymentErrorCode` in `processor/src/dtos/operations/payment-errors.dto.ts`.

## Code Style

**Formatting:**
- Use TypeScript strict mode in both packages: `enabler/tsconfig.json` and `processor/tsconfig.json` set `strict: true`, `declaration: true`, `target: ES2022`, and `forceConsistentCasingInFileNames: true`.
- Use two-space indentation in TypeScript, JSON, YAML, and Markdown examples: `processor/src/config/config.ts`, `enabler/src/components/card.ts`, `.github/workflows/connect-validate.yml`.
- Use double quotes and semicolons in TypeScript source: `processor/src/server/server.ts`, `processor/src/payment-sdk.ts`, `enabler/src/index.ts`.
- Keep trailing commas in multi-line object, array, function-call, and parameter lists: `processor/src/services/nuvei-payment.service.ts`, `enabler/src/components/card.ts`, `processor/src/server/server.ts`.
- No Prettier, Biome, ESLint, or EditorConfig configuration is present in the repository root; `.oxlintrc.json` enables only `typescript` and `unicorn` plugins.

**Linting:**
- Use Oxlint configuration from `.oxlintrc.json`; no package declares a pinned lint script in `enabler/package.json`, `processor/package.json`, or `testing/package.json`.
- Keep code compatible with TypeScript strict compilation through `npm run build --prefix enabler` and `npm run build --prefix processor`; these are the enforceable static checks exposed by `enabler/package.json` and `processor/package.json`.
- Avoid relying on repository-level scripts: no root `package.json` is present, and commands use npm `--prefix` as documented in `docs/DEVELOPMENT.md`.

## Import Organization

**Order:**
1. External packages and Node built-ins first: `@commercetools/connect-payments-sdk`, `@sinclair/typebox`, `fastify`, and `node:crypto` imports in `processor/src/routes/operation.route.ts`, `processor/src/routes/nuvei-payment.route.ts`, and `processor/src/clients/nuvei.client.ts`.
2. Internal DTOs, services, config, and libs next, using relative imports: `processor/src/routes/nuvei-payment.route.ts` imports DTOs before service and logger modules.
3. Type-only imports use `import type` when the symbol is erased at runtime: `type NuveiResult` in `enabler/src/components/card.ts`, `type FastifyReply` in `processor/src/libs/fastify/error-handler.ts`, `type Payment` in `processor/src/services/nuvei-payment.service.ts`.
4. Tests declare `vi.mock(...)` calls before importing modules under test when mocks affect imported dependencies: `processor/test/unit/services/nuvei-payment.service.test.ts`, `processor/test/unit/routes/dmn-webhook.route.test.ts`, `enabler/test/unit/card.test.ts`.

**Path Aliases:**
- No path aliases are configured in `enabler/tsconfig.json`, `processor/tsconfig.json`, `enabler/vite.config.ts`, or either `vitest.config.ts`; use relative imports.
- Source ESM imports include `.js` extensions for local TypeScript modules so NodeNext/bundled ESM output resolves correctly: `processor/src/index.ts`, `processor/src/routes/operation.route.ts`, `enabler/src/index.ts`.
- Test imports generally omit `.js` extensions and point at TypeScript source paths: `processor/test/unit/clients/nuvei.client.test.ts`, `enabler/test/unit/payment-enabler.test.ts`.

## Error Handling

**Patterns:**
- Use domain-specific public errors for user-facing payment setup failures. `PaymentSetupError` in `processor/src/dtos/operations/payment-errors.dto.ts` stores a safe `code`, public `message`, HTTP `statusCode`, and private diagnostics for logs.
- Map payment setup errors at the route boundary without leaking request payloads. `processor/src/routes/nuvei-payment.route.ts` catches `PaymentSetupError`, logs `code` and diagnostics with `log.warn`, and returns `error.toPublicError()`.
- Throw regular `Error` for invariant violations inside internal service validation: `processor/src/services/nuvei-payment.service.ts` throws on payment/cart/session mismatches, DMN amount mismatches, missing transaction IDs, and invalid Nuvei status data.
- Convert provider operation failures into commercetools modification outcomes where the Connect API expects an outcome. `capturePayment()`, `cancelPayment()`, and `refundPayment()` in `processor/src/services/nuvei-payment.service.ts` catch errors, log them, and return `PaymentModificationStatus.REJECTED`.
- Re-throw unrecoverable errors after logging when upstream route/error handlers must decide the HTTP response: `createPaymentIntent()` and `confirmPayment()` in `processor/src/services/nuvei-payment.service.ts`.
- Use Fastify's central error handler for framework validation and SDK errors. `processor/src/libs/fastify/error-handler.ts` maps Fastify validation errors, `ErrorAuthErrorResponse`, `Errorx`, and `MultiErrorx` into HTTP error bodies, and maps other errors to `ErrorGeneral`.
- Frontend enabler code surfaces asynchronous mount failures through caller callbacks. `CardComponent.mount()` in `enabler/src/components/card.ts` and `DropinComponents.mount()` in `enabler/src/dropin/dropin-embedded.ts` catch init failures and call `baseOptions.onError?.(error)`.
- Frontend API calls throw descriptive errors with HTTP status and status text on non-2xx responses. `apiService()` in `enabler/src/services/api-service.ts` implements this for create, get, and confirm calls.

## Logging

**Framework:** `processor/src/libs/logger/index.ts` exposes a custom JSON logger named `log`; the payment SDK adapter is `AppLogger` in `processor/src/payment-sdk.ts`. The enabler has no logging framework.

**Patterns:**
- Use structured logging with a message string and metadata object: `log.info("Creating Nuvei payment intent via openOrder.", { cartId, amount, currency, paymentMethod })` in `processor/src/services/nuvei-payment.service.ts`.
- Include request context automatically through `getRequestContext()` in `processor/src/libs/logger/index.ts`; every log entry includes `projectKey`, package version/name, `correlationId`, `pathTemplate`, and `path`.
- Write error-level logs to stderr and all other logs to stdout in `processor/src/libs/logger/index.ts`.
- Redact tokens before logging. Use `redactToken()` in `processor/src/services/nuvei-payment.service.ts` for session tokens.
- Log safe public diagnostics for rejected setup requests, not raw payment method options. `processor/src/routes/nuvei-payment.route.ts` logs `code`, `category`, and `requestedMethod`.
- Do not add console logging to application code; use `log` in processor modules and callback-based error surfacing in enabler modules.

## Comments

**When to Comment:**
- Use file-level comments to explain module purpose when the module is a public integration boundary: `enabler/src/index.ts`, `enabler/src/dropin/dropin-embedded.ts`, `enabler/src/services/api-service.ts`.
- Use section dividers in tests and component modules to separate helpers, mocks, public interface, and private helpers: `enabler/test/unit/card.test.ts`, `processor/test/unit/routes/dmn-webhook.route.test.ts`, `enabler/src/dropin/dropin-embedded.ts`.
- Use comments for non-obvious security or compatibility constraints: `processor/src/server/server.ts` documents raw body configuration for webhook routes, and `processor/src/dtos/operations/payment-components.dto.ts` documents why processor and enabler registries are mirrored.
- Avoid comments that restate simple code. Most functions in `enabler/src/components/card.ts` and `processor/src/clients/nuvei.client.ts` rely on clear names instead of line-by-line comments.

**JSDoc/TSDoc:**
- Use JSDoc on exported service methods and public contracts: `processor/src/services/nuvei-payment.service.ts` documents `config()`, `status()`, `capturePayment()`, `handleTransaction()`, `createPaymentIntent()`, `confirmPayment()`, and `processNuveiDmn()`.
- Use JSDoc for exported type contracts in enabler modules: `PaymentSessionResponse`, `ApiService`, and `ConfirmPaymentRequest` in `enabler/src/services/api-service.ts`; public interfaces in `enabler/src/payment-enabler/payment-enabler.ts`.
- Use compact block comments for fixture intent: `processor/test/unit/fixtures/dmn.fixtures.ts` documents each DMN payload category.

## Function Design

**Size:**
- Keep enabler component methods small and lifecycle-oriented: `CardComponent.mount()`, `submit()`, `isValid()`, `isAvailable()`, `init()`, and `handleNuveiResult()` in `enabler/src/components/card.ts` each own one step.
- Backend service methods may be larger when they orchestrate provider, commercetools, validation, and logging interactions; use private helpers inside `processor/src/services/nuvei-payment.service.ts` for repeated validation and formatting (`formatAmount()`, `assertNuveiStatusMatchesPayment()`, `parseAmountToCentAmount()`).
- Keep pure conversion logic isolated from I/O: `processor/src/services/converters/nuvei-event.converter.ts` converts DMN payloads without calling provider or commercetools services.

**Parameters:**
- Prefer a single options object for constructors and multi-field operations: `NuveiPaymentServiceOptions` in `processor/src/services/nuvei-payment.service.ts`, `NuveiClientConfig` in `processor/src/clients/nuvei.client.ts`, `apiService({ baseApi, sessionId })` in `enabler/src/services/api-service.ts`.
- Use explicit DTO types for route bodies, params, and replies: `processor/src/routes/operation.route.ts` and `processor/src/routes/nuvei-payment.route.ts` provide Fastify generic type parameters for `Body`, `Reply`, and `Params`.
- Use `unknown` at trust boundaries and narrow explicitly. `validatePaymentMethodOptions(options?: unknown)` in `processor/src/services/nuvei-payment.service.ts` validates shapes before accessing nested fields.

**Return Values:**
- Return typed Promises from all asynchronous integration methods: `Promise<PaymentProviderModificationResponse>` in `processor/src/services/nuvei-payment.service.ts`, `Promise<SafeChargeFactory>` in `enabler/src/services/nuvei-sdk.ts`.
- Return safe public response shapes at HTTP boundaries: `PaymentResponseSchemaDTO` from `processor/src/routes/nuvei-payment.route.ts`, `PublicPaymentErrorSchemaDTO` from `PaymentSetupError.toPublicError()` in `processor/src/dtos/operations/payment-errors.dto.ts`.
- Return discriminated unions for public frontend payment results: `PaymentResult` in `enabler/src/payment-enabler/payment-enabler.ts` uses `isSuccess: true` with payment data or `isSuccess: false`.

## Module Design

**Exports:**
- Export public enabler API from `enabler/src/index.ts`; it re-exports `enabler/src/payment-enabler/payment-enabler.ts`, `CardComponentBuilder`, and `DropinEmbeddedBuilder`.
- Keep route registration functions as named exports: `paymentRoutes` and `nuveiWebhookRoutes` in `processor/src/routes/nuvei-payment.route.ts`, `operationsRoute` in `processor/src/routes/operation.route.ts`.
- Keep DTO schemas and DTO types in the same module: `processor/src/dtos/nuvei-payment.dto.ts`, `processor/src/dtos/operations/status.dto.ts`, `processor/src/dtos/operations/transaction.dto.ts`.
- Keep singleton factory functions near their class implementation when configuration-backed caching is needed: `nuveiClient()` and `_nuveiClient` in `processor/src/clients/nuvei.client.ts`.

**Barrel Files:**
- Use `enabler/src/index.ts` as the browser package public barrel.
- Do not add broad processor barrel files; processor modules import concrete DTO, service, client, config, and lib files directly, as shown in `processor/src/routes/nuvei-payment.route.ts` and `processor/src/services/nuvei-payment.service.ts`.
- Do not share the payment method registry module between processor and enabler. Keep mirrored registries in `processor/src/dtos/operations/payment-components.dto.ts` and `enabler/src/payment-enabler/method-registry.ts`; parity is enforced by `processor/test/unit/contract/payment-method-contract.test.ts`.

---

*Convention analysis: 2026-06-02*
