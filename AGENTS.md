<!-- GSD:project-start source:PROJECT.md -->

## Project

**Nuvei commercetools Connector**

A commercetools Connect payment connector that integrates Nuvei as a payment service provider for commercetools Checkout. The project contains a browser enabler that loads Nuvei Simply Connect/Web SDK components and a processor service that creates Nuvei sessions, updates commercetools Payments, handles Payment Intents operations, and reconciles final state through Nuvei DMN webhooks.

The current codebase is a working first-pass implementation, but the project is not production-ready until real sandbox E2E validation, DMN correlation, reconciliation correctness, security hardening, deployment repeatability, and CI quality gates are proven.

**Core Value:** Card-first Nuvei payments must reconcile correctly and safely between browser Checkout, Nuvei, and commercetools Payments without duplicate, missing, or misattributed transactions.

### Constraints

- **Reliability**: Payment state transitions must be idempotent and correctly correlated — duplicate or wrong-payment financial transactions are unacceptable.
- **Security**: No secrets, checksums, session tokens, PANs, or raw sensitive payment data may be exposed to shoppers or stored/logged unsafely.
- **Platform**: The connector must follow commercetools Connect payment integration expectations for enabler assets, processor routes, session auth, JWT/OAuth operation routes, and Payment Intents behavior.
- **Nuvei**: Nuvei sandbox payloads and Web SDK behavior must be observed directly before production claims or reconciliation assumptions are accepted.
- **Documentation**: Deployment and testing instructions must match the actual npm/package-lock repository layout unless the package strategy is intentionally changed.
- **Scope**: Card-first Checkout correctness takes precedence over adding wallets, APMs, express payments, or stored payment methods.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Platform

| Technology | Version / Policy | Purpose | Why |
|------------|------------------|---------|-----|
| commercetools Connect | Current managed Connect runtime | Host connector applications | The official payment integration template is a two-application connector: an `assets` enabler serving static frontend assets and a `service` processor orchestrating PSP calls, Payment updates, Payment Intents operations, and asynchronous payment events. This matches the repository shape. |
| commercetools Checkout | Current Checkout, Complete Checkout and Payment Only modes | Browser checkout integration and payment orchestration | Checkout expects payment connectors to integrate through Connect, Sessions, connector enabler assets, processor endpoints, and Payment Intents. Do not build cart-to-order or checkout UI responsibility into the processor. |
| commercetools Payments API | Current Composable Commerce API | Source of truth for Payment records and transaction state | Nuvei is execution truth, but commercetools is the system of record for carts, orders, Payment objects, and transaction history. Reconciliation correctness depends on standard Payment fields and idempotent transaction updates. |
| Nuvei REST + Simply Connect/Web SDK | Sandbox-proven current Nuvei APIs; pin documented SDK URL/SRI where possible | PSP payment execution and browser card capture | The connector must let Nuvei handle sensitive card data and 3DS, reducing PCI exposure. Sandbox DMN payloads must be treated as the authority for correlation fields before production claims. |

### Runtime And Language

| Technology | Version / Policy | Purpose | Why |
|------------|------------------|---------|-----|
| Node.js | Use the Connect-supported active LTS line; standardize locally and in CI with `.nvmrc` or Volta after confirming Connect runtime | Runtime for processor scripts and local tooling | The current packages are ESM TypeScript projects targeting Node execution. Do not rely on non-LTS Node features that Connect may not support. |
| TypeScript | Keep strict TypeScript; repo currently uses `typescript ^6.0.3` in both apps | Shared implementation language | Payment reconciliation is branch-heavy and DTO-heavy; strong types reduce accidental state mismatches. Use runtime schemas at every HTTP/webhook boundary because TypeScript does not validate inbound input. |
| ESM | Keep `"type": "module"` | Module format | Both packages already use ESM. Keep one module system; do not add CommonJS-only code or dual builds unless a Connect requirement proves it necessary. |

### Package Manager Strategy

| Technology | Version / Policy | Purpose | Why |
|------------|------------------|---------|-----|
| npm | Current policy: package-local npm commands with `processor/package-lock.json`, `enabler/package-lock.json`, and `testing/package-lock.json`; no root workspace manifest | Deterministic installs and CI/deployment parity | Current repository evidence shows no root `package.json` and no `pnpm-lock.yaml`. Use `npm --prefix <package>` or change into the package directory unless a deliberate workspace migration updates scripts, CI, and docs in the same phase. |
| package-local lockfiles | Commit lockfiles; use `npm ci --prefix <package>` in CI and repeatable local checks | Reproducible dependency graph | Payment connectors should not float transitive dependencies during deploy. Keep package locks aligned with the package manager actually used by Connect scripts. |

### Backend Processor

| Technology | Version / Policy | Purpose | Why |
|------------|------------------|---------|-----|
| Fastify | Keep Fastify 5.x; repo currently uses `fastify ^5.8.5` | HTTP service framework | Fastify current docs identify latest as v5.8.x. It is a good fit for small, schema-first Connect services, raw webhook bodies, request context, and low-overhead route handling. |
| `@sinclair/typebox` + `@fastify/type-provider-typebox` | Keep; repo currently uses TypeBox `^0.34.49` and provider `^6.1.0` | Runtime request/response schemas with TypeScript inference | Use schemas for `/payments`, `/payments/confirmPayments/:id`, `/payment-intents/:id`, `/payment-components`, and webhook parse boundaries. Financial state changes must reject malformed input before business logic. |
| `fastify-raw-body` | Keep only for Nuvei DMN routes that require exact body verification | Webhook checksum validation | Nuvei checksum verification may depend on exact payload bytes/fields. Scope raw body capture narrowly; do not enable broad raw body handling for ordinary JSON routes. |
| `@fastify/cors`, `@fastify/formbody`, `@fastify/request-context` | Keep where used | Browser calls, webhook/form payload support, request-scoped diagnostics | These fit the documented route model. CORS must be explicit for Checkout/Connect origins, not permissive by default. |
| commercetools SDKs | Keep `@commercetools/connect-payments-sdk`, `@commercetools/platform-sdk`, and `@commercetools/sdk-client-v2` current within a tested lockfile | Connect auth, Payments, Payment Intents, and platform API calls | Use official SDKs rather than hand-rolled API clients for commercetools. Hand-roll only Nuvei calls where Nuvei has no fit-for-purpose package in this repo. |
| `dotenv` | Dev/test only | Local configuration | Do not rely on `.env` in Connect. Connect configuration must come from deployment config and secured configuration. |

### Frontend Enabler

| Technology | Version / Policy | Purpose | Why |
|------------|------------------|---------|-----|
| Vite | Keep Vite library build; repo currently uses `vite ^8.0.10` | Build `enabler/public/connector-enabler.es.js` and `enabler/public/connector-enabler.umd.js` browser assets | Vite official docs support library mode for browser-oriented libraries and produce ESM/UMD output suitable for static asset hosting. The enabler is a thin browser library, not an app shell. |
| TypeScript | Same major as processor | Public enabler contract and DTOs | Keep API types explicit for `NuveiEnabler` options, callbacks, component builders, and processor responses. Runtime validation is still required for shopper/session-provided values. |
| Nuvei Web SDK script loader | Custom, small, tested loader | Load PSP-hosted browser components | Keep the loader small and deterministic: single insertion, concurrent caller sharing, retry after failed load, pinned URL/SRI process, no shopper secrets in DOM-visible config. |
| `serve` | Dev/local preview only | Serve built static asset locally | OK as a local utility. Do not make `serve` part of production runtime; Connect serves assets. |

### Testing

| Technology | Version / Policy | Purpose | Why |
|------------|------------------|---------|-----|
| Vitest | Keep; repo currently uses `vitest ^4.1.5` and `@vitest/coverage-v8 ^4.1.5` in both packages | Unit and integration-style tests | One test runner across processor and enabler is enough. Favor behavior tests for reconciliation, idempotency, mismatch rejection, SDK load failure recovery, and safe error handling. |
| Real Nuvei sandbox fixtures | Required for DMN/status tests | Reconciliation proof | Current docs identify sandbox DMN correlation as the main unresolved risk. Do not treat mock-only tests as production evidence for status mapping, `merchant_unique_id`, `clientUniqueId`, 3DS, capture, cancel, or refund. |
| Minimal browser harness | Required before production readiness | Checkout/enabler verification | Unit tests cannot prove Checkout loads the static asset, renders card components, survives 3DS, or handles pending confirmation. Use a small harness against a deployed processor and sandbox account. |
| No broad mocking of payment state | Policy | Avoid false confidence | Mocking commercetools and Nuvei too deeply hides correlation bugs. Use local mocks for deterministic branch tests, then real fixtures/sandbox for payment semantics. |

### CI And Release Gates

| Technology | Version / Policy | Purpose | Why |
|------------|------------------|---------|-----|
| GitHub Actions | Existing Connect validation only | Pull request and release validation | `.github/workflows/connect-validate.yml` installs enabler and processor dependencies with Node.js 20, installs `@commercetools/cli@0.0.17`, and runs `commercetools connect validate .`. It does not currently run builds or Vitest suites. |
| npm cache + `npm ci` | Required | Deterministic CI installs | CI must install exactly from lockfiles. Do not use `npm install` in CI validation jobs because it may rewrite lockfiles. |
| commercetools Connect validation | Existing release/PR guard | Catch descriptor/deployment issues before preview/publish | Keep Connect descriptor validation, but add package builds and tests before relying on CI as a complete quality gate. |
| Release tags | Required before connector publishing | ConnectorStaged source versioning | Connect deployment flow uses repository source versions. Release automation should block tag/release creation or connector preview when package tests/builds fail. |

### Observability And Operations

| Technology / Pattern | Version / Policy | Purpose | Why |
|----------------------|------------------|---------|-----|
| Structured JSON logs | Keep current logger pattern; harden redaction | Processor diagnostics in Connect logs | Payment support needs searchable `paymentId`, Nuvei transaction ID, order/session/correlation IDs, route, result, and reason codes. Never log secrets, checksums, session tokens, PAN, raw SDK payloads, or unredacted webhook bodies. |
| Request correlation ID | Required | Trace browser → processor → Nuvei → DMN | Every create/confirm/webhook/payment-intent path must log stable correlation fields without relying on a single ambiguous Nuvei ID. |
| Reconciliation metrics via logs first | Recommended before adding an APM vendor | Operational visibility | Connect exposes application logs; start with structured log events for authorization success/failure, pending confirmations, DMN accepted/rejected/duplicate/mismatch, capture/cancel/refund result, and Nuvei API latency. Add a vendor APM only when Connect deployment constraints and data residency are confirmed. |
| Error redaction helper | Required | Safe support diagnostics | Centralize redaction before logging exceptions from Nuvei, commercetools SDKs, JWT/session validation, and webhooks. |
| Runbooks | Required | Incident response | Docs already call for failed authorization, missing DMN, failed capture, failed refund, and Nuvei outage runbooks. Observability fields should be designed to answer those runbooks. |

## Current Repository Evidence

| Area | Evidence | Recommendation |
|------|----------|----------------|
| Package layout | `processor/package.json`, `enabler/package.json`, and `testing/package.json` exist with separate lockfiles; there is no root package manifest or `pnpm-lock.yaml`. | Keep docs and CI on package-local npm commands. Add root npm workspaces only as a deliberate cutover. |
| Processor stack | `processor` uses ESM, TypeScript, Fastify 5, TypeBox, commercetools SDKs, raw body, request context, and Vitest. | Keep this stack. Invest in route schemas, idempotency, redacted logs, and sandbox fixture coverage rather than switching frameworks. |
| Enabler stack | `enabler` uses ESM, TypeScript, Vite, Vitest, and `serve`; built output is `enabler/public/connector-enabler.es.js` and `enabler/public/connector-enabler.umd.js`. | Keep Vite library build. Make SDK loading resilient and contract validation explicit before expanding payment methods. |
| Documentation drift | Regenerated docs now use package-local npm commands and avoid production-ready claims; `.planning/INGEST-CONFLICTS.md` records stale source-doc conflicts that were pruned or deferred. | Treat `.planning/` and generated canonical docs as source of truth. |
| Core risk | Project context names card-first reconciliation correctness as core value. | Stack choices must optimize correctness, not payment-method breadth or framework novelty. |

## What Not To Use

| Do Not Use | Why Not | Use Instead |
|------------|---------|-------------|
| pnpm in docs/CI while repo and Connect deployment use npm locks | Split package-manager strategy causes irreproducible installs and broken onboarding/deployments. | npm consistently, preferably npm workspaces with one root lockfile after a clean cutover. |
| Express/Koa/NestJS rewrite | No evidence the current Fastify stack blocks requirements; a rewrite would add risk without improving reconciliation. | Keep Fastify 5 and harden schemas, plugins, and tests. |
| Next.js/React app for the enabler | The enabler is a static PSP component wrapper, not a storefront. Framework runtime would bloat the browser asset and complicate Checkout embedding. | Vite library-mode TypeScript bundle. |
| Custom commercetools Types for payment metadata | Project policy says native Payment fields only; custom types add deployment/migration/cleanup burden. | `interfaceId`, `paymentMethodInfo.method`, `paymentStatus.interfaceCode`, and standard `transactions[]`. |
| Separate webhook service | Current architecture embeds DMN handling in the processor and Connect template supports asynchronous payment event handling there. | Keep `/webhooks/nuvei` in processor with raw-body checksum validation and idempotency. |
| Browser-side PSP status as final truth | Browser callbacks can be delayed, interrupted, or inconclusive. | Treat frontend confirmation as one signal; final reconciliation must tolerate DMN arrival, duplicates, and mismatches. |
| Generic APM/tracing SDK by default | May create data-residency, secret leakage, and Connect compatibility concerns. | Structured JSON logs and redaction first; add APM after operational requirements are known. |
| Wallet/APM expansion before card correctness | Each method multiplies unproven correlation, webhook, and refund/cancel paths. | Card-first baseline with real sandbox fixtures, then method registry expansion. |

## Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Nuvei DMN correlation assumptions are wrong | Duplicate, missing, or misattributed commercetools transactions | Capture real sandbox payloads for authorization, decline, 3DS, capture, cancel, refund, duplicate, and mismatch. Make canonical ID strategy a phase gate. |
| Package manager drift persists | CI/deploy commands differ from docs and local development | Choose npm now; update README/deployment docs/connect scripts together. |
| Floating dependency ranges change payment behavior | Subtle build/runtime changes in financial flows | Use `npm ci`, commit lockfiles, and schedule explicit dependency update reviews with sandbox regression tests. |
| Raw webhook logging leaks sensitive payloads | Security/compliance incident | Redact centrally; log identifiers and status only. Keep raw bodies in memory only for verification. |
| Enabler treats pending status as failure | False failed checkout even if DMN later authorizes | Add tri-state confirmation and bounded polling; let DMN reconcile final state. |
| Connect runtime version is assumed incorrectly | Deployment-only failures | Confirm Connect Node/runtime support and pin local/CI Node to the same supported LTS line. |

## Installation And CI Command Policy

## Sources

- Repository evidence: `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/INGEST-CONFLICTS.md`, `docs/ARCHITECTURE.md`, `README.md`, `processor/package.json`, `enabler/package.json`, and `testing/package.json`.
- commercetools documentation: Payment integration template, including enabler/processor architecture and best practices for idempotency, fault tolerance, PCI compliance, request validation, duplicates, webhooks, retries, and testing (`https://docs.commercetools.com/connect/templates/payment-integration`).
- commercetools documentation: Checkout connector/application model and Checkout modes (`https://docs.commercetools.com/checkout/connectors-and-applications`, `https://docs.commercetools.com/learning-implement-checkout/implement-commercetools-checkout/intro-to-commercetools-checkout`).
- npm documentation: npm workspaces and workspace script execution (`https://docs.npmjs.com/cli/v11/using-npm/workspaces/`).
- Fastify documentation: latest Fastify docs identify v5.8.x as current (`https://fastify.dev/docs/latest/`).
- Vite documentation: production build and library mode support (`https://vite.dev/guide/build`).

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

### Agent Behavioral Rules

- **Never deploy automatically.** The user handles all deployments manually. The assistant must not trigger commercetools Connect deployments, redeployments, or any deployment-related actions.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project-specific skill directory is configured in this repository. If project-local skills are added later, put them under a documented agent-specific skills directory with the required index file for that agent runtime.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
