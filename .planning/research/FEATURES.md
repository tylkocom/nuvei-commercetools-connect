# Feature Landscape

**Domain:** Card-first commercetools Connect payment connector for Nuvei
**Project:** Nuvei commercetools Connector
**Researched:** 2026-06-02
**Overall confidence:** HIGH for repository-derived feature expectations; MEDIUM for Nuvei sandbox behavior until real DMN/E2E payloads are captured.

## Product Positioning

This connector should be treated as a reconciliation-first payment product, not as a broad payment-method catalog. Its core value is that browser Checkout, processor responses, Nuvei status, Nuvei DMN webhooks, and commercetools Payment transactions agree without duplicate, missing, unsafe, or misattributed financial state changes.

The roadmap should optimize for a narrow, correct card authorization baseline before expanding payment methods. Wallets, APMs, express buttons, and stored credentials all multiply reconciliation, security, and operational paths; they should remain deferred until card authorization, 3DS, capture, cancel, refund, DMN idempotency, sandbox E2E, and operational documentation are proven.

## Table Stakes

Features users and operators expect from a production-capable card payment connector. Missing items make the connector unsafe, incomplete, or misleading.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Card Web Component authorization | Card is the core supported method and the primary Checkout payment path. | High | Must work in browser Checkout with Nuvei SDK, processor session creation, frontend confirmation, CT Payment update, and later DMN reconciliation. |
| Complete Checkout support | README and project docs position the connector for commercetools Complete Checkout. | High | Must prove authorization success, decline, 3DS, and DMN idempotency in a real sandbox Checkout session. |
| Payment Only support | Existing docs explicitly target Payment Only mode as well as Complete Checkout. | High | Same correctness requirements as Complete Checkout; cannot be assumed from Complete Checkout success. |
| Nuvei `openOrder` session creation | Browser widget requires a Nuvei session token before shopper card entry. | Medium | Processor must create the session with correct amount, currency, CT correlation identifiers, return URL, and safe billing/shopper fields. |
| Explicit supported payment method contract | Merchant Center, processor `/payment-components`, and enabler builders must agree. | Medium | Unsupported methods must fail before creating Nuvei orders or CT Payments. Card should be first-class; drop-in should be classified as supported or transitional. |
| Enabler runtime validation | Integrators need actionable failures for bad setup. | Medium | Validate `processorUrl`, `sessionId`, `merchantId`, `merchantSiteId`, environment, container, callbacks, and component type early. |
| Safe frontend Nuvei SDK loading | Checkout cannot depend on fragile browser asset behavior. | Medium | Load the Nuvei SafeCharge SDK once, reuse existing script, handle concurrent mounts, and reset cached loader state after failed script loads so retry is possible. |
| 3DS frictionless approval | Modern card authorization often requires 3DS signals even without shopper challenge. | High | Must reconcile frontend confirmation, Nuvei dashboard status, and DMN to one successful CT Authorization. |
| 3DS step-up challenge approval | Shopper challenge flows are table stakes for card acceptance. | High | Must return to Checkout/return URL cleanly and avoid duplicate success when DMN follows frontend confirmation. |
| 3DS failure or abandonment handling | Failed challenge must not create false successful authorization. | High | Failure may be immediate or DMN-driven, but the chosen contract must be explicit and safe. |
| Declined card handling | Shoppers expect safe failure messaging; merchants expect failed Payment state. | Medium | Avoid raw Nuvei errors, tokens, checksums, or card data in browser responses/logs. Record a CT Failure transaction or document if final state is deferred to DMN. |
| Tri-state/pending confirmation semantics | Nuvei confirmation can be delayed or inconclusive while DMN may later finalize state. | High | Browser confirmation should distinguish success, failure, and pending instead of treating every inconclusive status as shopper-visible error. |
| Canonical DMN correlation | Wrong-payment updates are unacceptable in payment reconciliation. | Critical | Real sandbox payloads must prove the field strategy, especially `merchant_unique_id` / Payment ID versus `clientUniqueId` / cart ID. |
| DMN checksum validation | Webhooks must be authenticated before mutating CT Payments. | Medium | Invalid/tampered payloads must return a safe rejection and leave CT state unchanged. |
| DMN idempotency | Nuvei may deliver duplicate notifications. | High | Same Nuvei interaction/transaction must not create duplicate CT transactions, even after frontend confirmation already updated state. |
| DMN amount/currency validation | Prevents validly correlated but financially mismatched updates. | High | Reject or quarantine mismatches; never silently update a Payment with unexpected amount or currency. |
| Out-of-order DMN handling | Auth, capture, cancel, and refund notifications may not arrive in business-order sequence. | High | Processor needs deterministic state transition rules and redacted diagnostics for impossible transitions. |
| Capture authorized payment | Delayed capture is required for physical goods and is documented as supported. | High | Must use the correct Nuvei authorization transaction ID and create a CT `Charge` without duplication on later DMN. |
| Cancel uncaptured authorization | Merchants need to void authorizations before capture. | High | Must call Nuvei void/cancel with the authorization transaction ID and record CT `CancelAuthorization`. |
| Refund captured payment | Post-capture refund is a standard payment operation. | High | Must call Nuvei refund with the charge transaction ID and record CT `Refund`. |
| Reverse operation semantics | commercetools Payment Intents may ask to reverse without knowing capture state. | Medium | Authorized-but-uncaptured should cancel; captured should refund. Never refund an uncaptured auth or void a captured charge. |
| Partial capture decision | Commerce operations often require partial fulfillment. | Medium | Either support exact partial capture amounts or explicitly reject as unsupported; accidental full capture is unacceptable. |
| Partial refund decision | Commerce operations often require partial refund and multiple refund attempts. | Medium | Either support amount-bounded partial refunds or explicitly reject. Prevent refunds exceeding captured total. |
| Local mock testing harness | Developers need fast iteration without requiring live Nuvei/CT for every branch. | Medium | Local mock should cover CT Payment state observation, processor routes, invalid method, failed auth, duplicate/mismatch DMN, and operation routes. |
| Sandbox E2E evidence collection | Unit tests cannot prove Checkout, Nuvei SDK, 3DS, or DMN behavior. | High | Capture real logs/payloads for success, decline, 3DS, capture, cancel, refund, duplicate DMN, missing correlation, and mismatch events. |
| Operational status endpoint | Operators need health signals for CT permissions and Nuvei reachability. | Medium | `/status` should report degraded Nuvei/CT dependencies without leaking secrets. |
| Deployment hooks and DMN setup guidance | Connect deployment requires external Nuvei dashboard DMN URL setup. | Low | `postDeploy` should log the correct webhook URL; docs must instruct manual dashboard configuration and cleanup on undeploy. |
| Redacted structured logging | Support needs diagnosability without exposing secrets or payment data. | Medium | Logs should include safe IDs, route, correlation, CT Payment ID, Nuvei transaction ID, status, and reason; never secrets, checksums, session tokens, PAN, or raw sensitive payloads. |
| Documentation matching repository reality | Operators and maintainers must be able to deploy/test from docs alone. | Medium | Current docs conflict on npm vs pnpm/root workspace and readiness claims; feature completion requires correcting docs. |
| CI quality gates | Payment connector changes should not rely on manual local verification only. | Medium | Required for production readiness, but not a runtime feature. Should cover enabler/processor install, build, and tests using the chosen package manager. |

## Differentiators

Features that are not required for the first stable card connector, but materially improve reliability, supportability, or adoption once the baseline is correct.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Reconciliation-first transaction ledger behavior | Makes the connector safer than a callback-only integration. | High | A canonical state machine across frontend confirmation, Nuvei status, DMN, and CT transactions reduces duplicate/missing transaction incidents. |
| Real Nuvei sandbox fixture library | Gives maintainers reproducible examples for DMN and operation edge cases. | Medium | Store sanitized fixtures for auth success/failure, 3DS, capture, cancel, refund, duplicates, malformed, missing correlation, mismatch. |
| Browser pending-state polling | Improves shopper UX when Nuvei status is delayed but not failed. | Medium | Bounded polling against processor can avoid false errors while still timing out safely. |
| Typed payment method registry | Makes future expansion cheaper and less error-prone. | Medium | One source of truth for processor advertisement, enabler builders, validation, method labels, and Nuvei method-specific options. |
| Merchant Center observability improvements | Helps support staff identify payment method, brand, and current status quickly. | Low | Use native CT Payment fields such as `paymentMethodInfo.method`, `interfaceId`, transactions, and `paymentStatus.interfaceCode`; avoid Custom Types per project policy. |
| Operation runbooks | Shortens incident handling for failed authorization, missing DMN, failed capture/refund, and Nuvei outage. | Medium | Should include where to look in CT, Nuvei dashboard, and processor logs; include safe manual recovery guidance. |
| Minimal browser E2E harness | Separates Checkout asset loading and Nuvei widget issues from full hosted Checkout complexity. | Medium | Useful before and alongside sandbox Checkout validation; should not replace real Checkout E2E evidence. |
| Deployment repeatability checklist | Reduces environment drift across Connect deployments. | Low | Include required environment variables, Nuvei DMN dashboard setup, checksum algorithm, region URLs, package manager commands, and cleanup. |
| Safe shopper error taxonomy | Improves UX and support without exposing PSP internals. | Medium | Map Nuvei/client/processor errors to safe categories: declined, pending, authentication failed, unavailable, invalid session, unsupported method. |

## Anti-Features

Features or implementation choices to explicitly avoid because they weaken correctness, increase risk, or contradict project policy.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Wallet/APM expansion before card reconciliation is proven | Multiplies unverified Nuvei payload shapes, method options, shopper flows, and DMN mappings. | Stabilize card, 3DS, DMN, capture/cancel/refund, sandbox evidence, and runbooks first. |
| Treating drop-in as production-supported by accident | Drop-in can mask unsupported methods and widen scope without explicit reconciliation rules. | Decide deliberately: either support embedded drop-in with the same tests as card, or mark it transitional/internal. |
| Creating CT Payments for unsupported methods | Leaves orphaned or misleading Payment state and can create reconciliation gaps. | Validate method before Nuvei `openOrder` or CT Payment mutation. |
| Browser-only success as final truth | Frontend callbacks can be delayed, duplicated, abandoned, or disagree with DMN. | Treat Nuvei/DMN reconciliation as final and keep frontend confirmation idempotent with DMN. |
| Updating CT Payment from an uncorrelated DMN | Can misattribute money movement to the wrong cart/order/payment. | Require canonical CT Payment ID correlation plus amount/currency checks before mutation. |
| Silent amount or currency coercion | Hides financial mismatches and can produce incorrect charges/refunds. | Reject mismatches explicitly and log redacted diagnostics. |
| Duplicate CT transactions for the same Nuvei event | Breaks reconciliation and can trigger incorrect order/payment status. | Use Nuvei transaction/interaction ID idempotency checks before adding transactions. |
| Generic retry loops around payment mutation | Can create duplicate financial operations if not idempotent end to end. | Retry only safe reads/status checks; make writes idempotent by interaction ID and operation state. |
| Storing PAN, raw card data, secrets, checksums, or session tokens | Violates security expectations and increases compliance risk. | Keep card handling inside Nuvei SDK; store only safe native CT metadata and redacted diagnostics. |
| Custom commercetools Types for payment metadata | Project policy says native Payment fields only; Custom Types add deployment and cleanup coupling. | Use `interfaceId`, `paymentMethodInfo`, `paymentStatus.interfaceCode`, and `transactions[]`. |
| Production-ready claims before sandbox E2E evidence | Misleads operators and downstream roadmap planning. | Label current state honestly and gate readiness on observed Checkout/Nuvei/DMN evidence. |
| Root/package-manager commands that do not match the repo | New maintainers cannot reproduce deployment or validation. | Standardize npm vs pnpm and update README/deployment/testing docs to match actual lockfiles and `connect.yaml`. |
| Shopper-facing raw Nuvei failures | Leaks internal details and may expose sensitive payment information. | Map to safe user messages and keep redacted detail in server logs. |
| Indefinite pending in browser Checkout | Leaves shoppers stuck and obscures payment outcome. | Use bounded pending state and clear recovery/retry guidance. |

## Deferred Expansion

These should be roadmap candidates only after the card-first baseline is correct and documented.

| Deferred Feature | Defer Until | Reason |
|------------------|-------------|--------|
| Apple Pay | Card, 3DS, DMN, operations, sandbox E2E, and runbooks are stable; Nuvei account/domain validation requirements are known. | Adds wallet-specific setup, domain validation, token behavior, and reconciliation cases. |
| Google Pay | Same gate as Apple Pay. | Adds wallet-specific browser and PSP contract requirements. |
| Nuvei APMs as individual components | Typed method registry and card reconciliation model are proven. | APMs often have asynchronous or redirect-heavy flows that require additional state handling. |
| Express payment buttons | Checkout requirements justify them and baseline operations are stable. | Changes checkout initiation order and can affect cart/payment ownership assumptions. |
| Stored payment methods / tokenized repeat payments | Security, consent, data retention, and CT representation are explicitly designed. | Higher security/compliance and lifecycle complexity than one-time card payments. |
| Chargeback handling beyond basic mapping | Core capture/refund/cancel lifecycle and DMN fixture coverage are stable. | Chargebacks are operationally important but require support process design and evidence from Nuvei payloads. |
| Multi-capture business rules | Partial capture behavior and fulfillment integration requirements are known. | Multiple capture introduces amount accounting, idempotency, and fulfillment coupling. |
| Advanced fraud/risk configuration surfaces | Nuvei fields and merchant operational needs are confirmed. | Risk options can change authorization outcomes and must be documented/tested carefully. |
| Multi-region/multi-merchant routing | Single merchant/site deployment is proven and operationally supportable. | Adds credential routing, logging, tenant isolation, and misconfiguration risk. |

## Feature Dependencies

```text
Package/deployment docs alignment → Repeatable local and Connect setup
Repeatable setup → Local mock testing + sandbox E2E execution
Supported method registry → /payment-components alignment → Card component + drop-in decision
Enabler option validation → Card component rendering → Browser authorization
Nuvei openOrder correlation fields → Frontend confirmation → DMN correlation
Canonical Payment ID correlation + amount/currency checks → Safe DMN mutation
DMN checksum validation + idempotency → Duplicate/tampered webhook safety
Successful Authorization transaction → Capture and CancelAuthorization operations
Successful Charge transaction → Refund operation
Capture/refund/cancel operation IDs → Operation DMN reconciliation
3DS return/pending semantics → Correct shopper completion and no false success
Redacted structured logging → Operational runbooks and support readiness
Sandbox fixtures → Regression tests for reconciliation and operations
Card baseline stability → Wallet/APM/express/stored-method expansion
```

## MVP Recommendation

Prioritize these features for the card-first production-readiness path:

1. **Canonical authorization and DMN reconciliation**
   - Prove real Nuvei sandbox payload fields.
   - Use CT Payment ID as the safest canonical correlation target if sandbox confirms it round-trips.
   - Reject missing, unknown, mismatched, or unsafe DMNs.
   - Make frontend confirmation and DMN idempotent with each other.

2. **Card Checkout contract correctness**
   - Make supported methods explicit and aligned between processor, enabler, and Merchant Center.
   - Validate enabler inputs and processor request bodies before creating external state.
   - Replace hardcoded browser billing/shopper data with documented, validated Checkout/session/cart/shopper-derived data or explicit enabler options.

3. **3DS and pending-state handling**
   - Prove frictionless, step-up approval, failure, and abandonment in Nuvei sandbox.
   - Implement safe success/failure/pending semantics so delayed Nuvei confirmation does not become a false error or false success.

4. **Capture, cancel, refund correctness**
   - Ensure each operation uses the correct Nuvei transaction identifier.
   - Decide and document partial capture/refund support.
   - Reconcile operation DMNs without duplicate CT transactions.

5. **Testing and operations readiness**
   - Use local mock testing for deterministic processor/enabler behavior.
   - Capture sanitized sandbox E2E fixtures for real Nuvei behavior.
   - Add CI gates, deployment instructions that match the repo, and runbooks for common failure modes.

Defer: wallets, APMs, express payments, stored payment methods, multi-merchant routing, and advanced fraud/risk surfaces until the card baseline is demonstrably stable.

## Roadmap Phase Suggestions

| Phase | Feature Scope | Rationale |
|-------|---------------|-----------|
| 1. Reconciliation Correctness | DMN correlation, checksum validation, amount/currency checks, idempotency, frontend/DMN consistency. | Prevents the highest-impact class of failures: duplicate, missing, or wrong-payment transactions. |
| 2. Card Checkout Contract | Supported method registry, enabler validation, real billing/shopper data, card/drop-in decision. | Makes the Checkout-facing API hard to misuse and keeps processor/enabler behavior aligned. |
| 3. Sandbox Card E2E + 3DS | Complete Checkout, Payment Only, declines, 3DS frictionless/challenge/failure, pending state. | Proves the real browser + Nuvei + CT path, not just local unit behavior. |
| 4. Payment Operations | Capture, partial/full capture decision, cancel, refund, partial refund decision, reverse semantics. | Completes the authorization lifecycle required by commerce operations. |
| 5. Local Mock + Regression Fixtures | Local mock scenarios, sanitized Nuvei fixtures, route-level tests, duplicate/mismatch fixtures. | Locks in behavior and accelerates safe maintenance. |
| 6. Deployment and Operational Readiness | CI, docs correction, Connect hooks verification, Nuvei dashboard setup, runbooks, log queries. | Makes the connector deployable and supportable by someone other than the original implementer. |
| 7. Optional Method Expansion | Wallets/APMs/express/stored methods after card stability. | Prevents scope expansion from compromising the core card reconciliation value. |

## Complexity Notes

| Area | Complexity | Why |
|------|------------|-----|
| Card rendering alone | Medium | Nuvei SDK loading and enabler API are contained browser concerns. |
| Card authorization end to end | High | Requires browser, Checkout session auth, processor, Nuvei, CT Payment, frontend confirmation, and DMN agreement. |
| DMN reconciliation | Critical | Requires exact correlation, idempotency, mismatch rejection, and safe handling of unknown/out-of-order statuses. |
| 3DS | High | Challenge/redirect/abandonment flows introduce asynchronous and user-driven state transitions. |
| Capture/cancel/refund | High | Each operation must use the correct prior Nuvei transaction and stay consistent with CT transaction history. |
| Local mock testing | Medium | Valuable but must not replace sandbox evidence for Nuvei-specific behavior. |
| Sandbox E2E | High | Environment setup and payload capture are heavier, but required for readiness. |
| Documentation/operations | Medium | Mostly deterministic writing and verification, but must match actual deployment shape. |
| Wallet/APM expansion | High | Each method may add different Nuvei options, browser behavior, DMN fields, and reconciliation semantics. |

## Sources

Repository-grounded sources used for this feature landscape:

- `.planning/PROJECT.md` — core value, active requirements, constraints, decisions, current gaps. Confidence: HIGH.
- `docs/ARCHITECTURE.md` — connector shape, routes, transaction/status mapping, native Payment field policy. Confidence: HIGH for intended architecture; MEDIUM where docs conflict with repository layout/readiness status.
- `docs/NEXT_STEPS_PLAN.md` — contract hardening, E2E validation, reconciliation, metadata, security, testing, operations, expansion phases. Confidence: HIGH for project intent.
- `docs/TEST_SCENARIOS.md` — functional scenarios and completion criteria for card, 3DS, operations, DMN, auth, outage, deployment, docs. Confidence: HIGH for acceptance expectations.
- `README.md` — stated product scope and current status claims. Confidence: MEDIUM because `.planning/PROJECT.md` identifies readiness/package-manager drift that must be corrected before production claims.
