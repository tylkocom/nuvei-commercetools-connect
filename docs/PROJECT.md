# Nuvei commercetools Connector

## What This Is

A commercetools Connect payment connector that integrates Nuvei as a payment service provider for commercetools Checkout. The project contains a browser enabler that loads Nuvei Simply Connect / Web SDK components and a processor service that creates Nuvei sessions, confirms widget results, handles Payment Intents operations, and reconciles final state through Nuvei DMN webhooks.

The card payment baseline — Web SDK `card`, Web SDK `blik`, and Simply Connect `embedded` drop-in — is implemented, unit-tested, and verified through manual end-to-end testing against real Nuvei and commercetools sandboxes (Complete Checkout and Payment Only modes). Production rollout is the operator's manual deployment step and is out of scope for this repository's automation.

## Core Value

Card-first Nuvei payments reconcile correctly and safely between browser Checkout, Nuvei, and commercetools Payments without duplicate, missing, or misattributed transactions.

## Requirements

### Validated

- ✓ Processor and enabler packages exist with unit test suites and TypeScript builds.
- ✓ Processor exposes payment, operation, and Nuvei webhook routes for the connector shape.
- ✓ Enabler exposes the Checkout-facing `card` and `blik` component builders plus the `embedded` drop-in, and fetches Nuvei config from the processor instead of requiring merchant config in the browser.
- ✓ Processor calls Nuvei `openOrder`/`getPaymentStatus` and maps Nuvei DMN data to commercetools transaction concepts.
- ✓ Capture, cancel authorization, refund, and reverse operations are implemented through Payment Intents route handlers.
- ✓ Tri-state payment confirmation (`approved` / `rejected` / `pending`) with canonical Nuvei `PPP_TransactionID` identity for terminal Authorization records.
- ✓ DMN processing is idempotent, rejects checksum-invalid / mismatched / duplicate / replayed events, and maps each valid event to exactly one commercetools Payment.
- ✓ Session-authenticated payment creation is idempotent per cart/session via cart freezing before the Nuvei session is opened.
- ✓ Card authorization, decline, 3DS (frictionless and step-up), capture, cancel, refund, duplicate-DMN, and mismatch-DMN flows verified against real Nuvei + commercetools sandboxes.
- ✓ Checkout-facing enabler/processor contracts are explicit, validated, and aligned for all supported methods (parity-tested).
- ✓ Package manager, build, and deployment documentation standardized on npm + `package-lock.json`.
- ✓ DMN checksum policy is SHA-256 only (validated at startup; no MD5 path exists anywhere).
- ✓ CI quality gates install, build, and test both packages and run `commercetools connect validate`.
- ✓ Secret handling and log redaction use an allowlist; no secrets, checksums, session tokens, or PAN-adjacent values reach logs or browser callbacks.

### Active

- _(none — card baseline is complete; see Out of Scope for deferred work)_

### Out of Scope

- Nuvei wallet/APM expansion — deferred until explicitly required; the shared registry allows adding methods without weakening card reconciliation.
- Production rollout — operator-driven deployment; this repository never triggers commercetools Connect deployments.
- Storing PAN or sensitive card data — the connector relies on Nuvei and safe native commercetools Payment metadata only.
- Custom commercetools Types for payment metadata — native Payment fields are used exclusively.

## Context

- The repository has two Connect applications: `enabler` (browser assets) and `processor` (Fastify service), plus a local mock/evidence harness in `examples/nuvei-web-ui/`.
- Nuvei is the source of truth for payment execution state. commercetools is the source of truth for carts, orders, and Payment records. DMN webhooks are the eventual-consistency mechanism for final state reconciliation.
- The Checkout-facing `Enabler` adapter is the only Merchant Center entry point; it is template-compatible (one-argument constructor, Nuvei config fetched from `GET /operations/config`, promise-based lifecycle, template-shaped `onComplete`/`onError` callbacks).
- Package layout: separate `processor/package-lock.json` and `enabler/package-lock.json`; no root workspace manifest. The project is npm-only (no pnpm/bun).
- CI (`.github/workflows/connect-validate.yml`) gates both packages on install/build/test plus Connect descriptor validation.

## Constraints

- **Reliability**: Payment state transitions are idempotent and correctly correlated — duplicate or wrong-payment financial transactions are unacceptable.
- **Security**: No secrets, checksums, session tokens, PANs, or raw sensitive payment data are exposed to shoppers or stored/logged unsafely.
- **Platform**: The connector follows commercetools Connect payment integration expectations for enabler assets, processor routes, session auth, JWT/OAuth operation routes, and Payment Intents behavior.
- **Documentation**: Deployment and testing instructions match the actual npm/`package-lock.json` repository layout.
- **Deployment**: All deployments are performed manually by the operator; this repository never triggers Connect deployments.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat card-first reconciliation as the core priority | Financial correctness matters more than breadth of payment methods | Adopted |
| Use native commercetools Payment fields instead of Custom Types | Keeps the connector simpler and aligned with the architecture | Adopted |
| Defer wallet/APM expansion | Card baseline is proven; methods can be added via the shared registry when required | Adopted |
| Use a local mock commercetools harness for development | Isolates Nuvei/processor behavior with full request/response visibility (`examples/nuvei-web-ui/`) | Adopted |
| SHA-256 only for DMN checksums | Single, startup-validated policy; no MD5 path | Adopted |
| `Enabler` is the only Checkout-facing adapter | Template-compatible entry point; provider specifics fetched from the processor | Adopted |

---
*Last updated: 2026-06-29*
