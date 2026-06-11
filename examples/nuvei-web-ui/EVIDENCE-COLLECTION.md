# Phase 2 Side-Based Evidence Collection

Automated, deterministic evidence collection for phase 2, organized by observation side:

1. **Nuvei side only** — direct Nuvei sandbox REST behavior (no commercetools involved)
2. **commercetools side only** — direct CT project API behavior (no Nuvei involved)
3. **End-to-end combined** — processor + mock CT ledger + Nuvei sandbox + DMNs

This complements (does not replace) the stage A–D NUV-xx scenario pipeline in
`scripts/capture-stage-*.mjs`. Side-based collection answers: *what does each
external system observably do, and is that behavior repeatable?*

## Implementation Plan

### Layout

| File | Purpose |
| --- | --- |
| `scripts/evidence-side-lib.mjs` | Shared run context: raw capture, sanitization (run-scoped alias map), determinism normalization, manifest writing, blocker recording, DMN receiver helper |
| `scripts/nuvei-rest-client.mjs` | Standalone signed Nuvei REST client (openOrder, payment, getPaymentStatus, settle, void, refund). Never throws on gateway results — captures them |
| `scripts/ct-rest-client.mjs` | Standalone commercetools REST client (client-credentials OAuth, carts, payments) |
| `scripts/collect-nuvei-side.mjs` | Nuvei-side flows N-01..N-04 (+ DMN capture when a tunnel is available) |
| `scripts/collect-ct-side.mjs` | CT-side flows C-01..C-03 with cleanup |
| `scripts/collect-e2e.mjs` | E2E flows E-01..E-06 against local processor + mock CT (+ DMN tunnel) |
| `scripts/collect-all-evidence.mjs` | Orchestrator: runs all three sides, then writes a combined manifest |
| `scripts/collect-sides-self-check.mjs` | Offline determinism self-check (no credentials needed) |

Output:

- Raw (gitignored): `.planning/tmp/phase-02-raw/sides/<side>/...`
- Committed fixtures: `.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/sides/<side>/...`
- Per-side `run-manifest.json` with sha256 per fixture — **two runs with the same observable behavior produce byte-identical fixtures and manifests**.

### Determinism rules

Captured payloads contain volatile values (tokens, UUIDs, timestamps, request ids).
Determinism is achieved by a fixed pipeline per fixture:

1. Write raw capture to the gitignored raw workspace (debugging aid, never committed).
2. Sanitize with `sanitize-evidence.mjs` using a **run-scoped alias map** (fresh each
   run, first-seen order) so identifiers become `sessionToken-001`, `payment-001`, …
   in the same order on every run.
3. Normalize leftovers: volatile keys (`timeStamp`, `responseTimeStamp`, `createdAt`,
   `lastModifiedAt`, `expiresAt`, `expires_in`, token fields, durations) become
   `[volatile]`; `createdBy`/`lastModifiedBy` objects are dropped; any remaining
   UUID-shaped string is aliased `uuid-001`, `uuid-002`, … in first-seen order.
4. Serialize with sorted keys + trailing newline; record sha256 in the manifest.

Blocked flows (missing credentials/tunnel) write deterministic blocker fixtures —
no timestamps — so a blocked run is also repeatable.

### Flows

**Nuvei side** (`evidence:nuvei`) — requires `NUVEI_MERCHANT_ID`,
`NUVEI_MERCHANT_SITE_ID`, `NUVEI_SECRET_KEY`; optional `NUVEI_API_BASE_URL`
(default sandbox), `DMN_PUBLIC_URL`:

- `N-01-auth-settle-refund`: openOrder → payment (Auth, approved test card `4761344136141390`) → getPaymentStatus → settleTransaction → refundTransaction
- `N-02-declined-auth`: openOrder → payment (declined test card `4107652651950141`) → getPaymentStatus
- `N-03-auth-void`: openOrder → payment (Auth approved) → voidTransaction
- `N-04-sale`: openOrder → payment (Sale approved) → getPaymentStatus
- Per flow: `field-observations.json` — which PPP id variants appear, what
  `merchant_unique_id`/`clientUniqueId` carry, checksum validation result of any DMN.
- DMNs captured when `DMN_PUBLIC_URL` is set (or an installed `ngrok` binary can be
  spawned); otherwise a deterministic `dmn-blocked.json` is recorded.

**commercetools side** (`evidence:ct`) — requires `CTP_PROJECT_KEY`,
`CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_AUTH_URL`, `CTP_API_URL`:

- `C-01-payment-lifecycle`: create cart → create Payment (interfaceId + Initial
  Authorization transaction, same shape the processor uses) → add payment to cart →
  changeTransactionState Initial→Success → addTransaction (Charge) →
  setStatusInterfaceCode → final payment snapshot
- `C-02-version-conflict`: stale-version update → capture the 409 ConcurrentModification body
- `C-03-cleanup`: delete payment + cart (keeps reruns starting from the same project state)

**End-to-end** (`evidence:e2e`) — requires Nuvei env vars and a built processor
(`npm --prefix processor run build`); optional DMN tunnel:

- Spawns mock CT (`mock-commercetools-server.mjs`) and the processor
  (`PHASE_02_STAGE_A_LOCAL_MOCK_CT=true`, CT URLs → mock), plus the DMN proxy
  (`capture-dmn-proxy.mjs`) when a tunnel is available
  (`CONNECT_SERVICE_URL` → tunnel, so `openOrder` carries `urlDetails.notificationUrl`).
- `E-01-auth-confirm`: processor session → Nuvei `payment.do` with approved card
  (stand-in for the browser SDK call) → processor confirm → mock ledger snapshot
- `E-02-capture-intent`, `E-03-refund-intent`, `E-04-cancel-intent`:
  `/payment-intents/:id` against the processor, ledger snapshot after each
- `E-05-duplicate-dmn`: replay a really-received DMN byte-for-byte → expect dedup
- `E-06-mismatch-dmn`: tampered amount + recomputed checksum (labeled
  `synthetic-derived-from-real-dmn`) → expect rejection
- DMN-dependent flows record deterministic blockers when no tunnel/DMN is available.

**Deployed processor visibility** — the safe `/debug/dump` replacement:
`EVIDENCE_CAPTURE_TOKEN` (≥ 16 chars, secured config) enables a token-gated
`GET /evidence/captures` route in the processor returning a bounded ring buffer of
**whitelisted** request/response summaries (route, status, correlation ids, DMN
correlation fields — never session tokens, checksums, card data, or raw bodies).
Unset (default) → route absent, zero buffering. `collect-e2e.mjs --deployed` pulls
the buffer from a deployed processor as supplementary fixtures.

## Operator Guide

```bash
# one-time
npm --prefix processor run build
npm --prefix examples/nuvei-web-ui install

# everything (each side records blockers instead of failing when prerequisites are missing)
export NUVEI_MERCHANT_ID=... NUVEI_MERCHANT_SITE_ID=... NUVEI_SECRET_KEY=...
export CTP_PROJECT_KEY=... CTP_CLIENT_ID=... CTP_CLIENT_SECRET=...
export CTP_AUTH_URL=https://auth.europe-west1.gcp.commercetools.com
export CTP_API_URL=https://api.europe-west1.gcp.commercetools.com
# optional, enables DMN evidence: a public HTTPS URL forwarding to localhost:8090
export DMN_PUBLIC_URL=https://<tunnel-host>

npm --prefix examples/nuvei-web-ui run evidence:all

# individual sides
npm --prefix examples/nuvei-web-ui run evidence:nuvei
npm --prefix examples/nuvei-web-ui run evidence:ct
npm --prefix examples/nuvei-web-ui run evidence:e2e

# determinism: run twice, then diff — identical behavior ⇒ identical bytes
npm --prefix examples/nuvei-web-ui run evidence:all
git diff --stat -- .planning/phases/02-*/evidence/sides

# offline self-check (CI-safe, no credentials)
npm --prefix examples/nuvei-web-ui run evidence:sides-self-check
```

Reading results: each side directory contains its flows' fixtures plus
`run-manifest.json` (`status`: `captured` / `partially-blocked` / `blocked`,
fixture hashes, blockers). `field-observations.json` files contain the
auto-derived conclusions (canonical id presence, checksum validity, dedup results).

Known sandbox behavior differences a diff can legitimately surface (these are
findings, not pipeline bugs):

- **Refund CCC restriction**: repeating N-01 quickly can return
  `transactionStatus: ERROR`, `gwErrorCode: -1100`
  (`Credit count exceeded CCC restriction`) — the Nuvei sandbox limits repeated
  refunds per test card per period. The first run of a day typically refunds
  `APPROVED`. Observed 2026-06-11 during back-to-back runs.
- Approval-path-only blocks (e.g. `cardHolderNameVerification`) disappear from
  responses on the declined path.

Deployed capture: set `EVIDENCE_CAPTURE_TOKEN` on the connector (secured config),
then `EVIDENCE_CAPTURE_TOKEN=... node scripts/collect-e2e.mjs --deployed --processor-url https://<service-url>`.
Unset the token after the evidence session.
