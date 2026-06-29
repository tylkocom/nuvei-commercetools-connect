# Roadmap

## Current status

The card payment baseline — Web SDK `card`, Web SDK `blik`, and Simply Connect `embedded` drop-in — is complete, unit-tested, and verified through manual end-to-end testing against real Nuvei and commercetools sandboxes (Complete Checkout and Payment Only modes). Production rollout is the operator's manual deployment step.

## Delivered

| Capability | Notes |
|------------|-------|
| Contract & method hardening | Invalid inputs and unsupported methods fail before any Nuvei or commercetools state is created. Enabler/processor method registries are parity-tested. |
| Nuvei sandbox validation | Card authorization, decline, 3DS (frictionless + step-up), capture, cancel, refund, duplicate-DMN, and mismatch-DMN flows verified against real sandboxes. |
| DMN reconciliation | Idempotent webhook processing; checksum-invalid / duplicate / replayed / mismatched events are rejected; each valid event maps to exactly one commercetools Payment. Canonical correlation via Nuvei `PPP_TransactionID`. |
| Checkout data & metadata | Shopper, billing, return URL, and locale sourced from the Checkout session and cart; native commercetools Payment fields only (no Custom Types). |
| Frontend resilience & security | Tri-state confirmation (`approved` / `rejected` / `pending`), bounded SDK-load retry, allowlist log redaction, and template-shaped safe callbacks. |
| Regression fixtures, local mock, CI | Sanitized DMN fixtures, the `examples/nuvei-web-ui/` mock harness, route/enabler unit tests, and CI gating both packages on install/build/test plus `commercetools connect validate`. |
| Deployment & ops readiness | Deployment docs, `GET /health` (with commit hash), `GET /status`, post-deploy/pre-undeploy scripts, and monitoring and rollback guidance. |

## Deferred

- **Wallet / APM expansion** (Apple Pay, Google Pay, regional APMs, stored payment methods, chargeback handling): available when each method has its own Nuvei setup, browser flow, DMN mapping, operation support, fixtures, and runbook. The shared method registry lets new methods be added without weakening card reconciliation guarantees.
- **Custom storefront direct usage**: hosted Checkout and Payment Only card reconciliation are proven; custom storefront usage inherits the same auth, session, fixture, and runbook guarantees.

## Production rollout

Production deployment is performed manually by the operator; this repository never triggers commercetools Connect deployments. See `docs/DEPLOYMENT.md`.

---
*Last updated: 2026-06-29*
