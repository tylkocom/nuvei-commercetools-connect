# Phase 01: Contract and Method Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 01-Contract and Method Hardening
**Areas discussed:** Error contract, Method registry

---

## Error Contract

| Question | Option | Description | Selected |
|----------|--------|-------------|----------|
| Public error response shape | Structured code + message | Return a stable error code plus safe human-readable message. Best for Checkout/enabler handling and tests. | ✓ |
| Public error response shape | Message only | Simpler, but brittle for clients and tests because behavior depends on strings. | |
| Public error response shape | Detailed diagnostics | Include fields like invalid method/input details in responses. More helpful but easier to leak sensitive context. | |
| Public vs internal errors | Safe public, rich redacted logs | Checkout receives code/message only; logs include route, correlation IDs, method, and redacted diagnostics. | ✓ |
| Public vs internal errors | Same everywhere | Use the same terse message in response and logs. Simpler but weak for operations. | |
| Public vs internal errors | Expose diagnostics in non-prod | Detailed responses in test/local, terse in production. Useful for debugging but increases contract complexity. | |
| Error-code categories | Config, method, request, auth | Enough for enabler config errors, unsupported methods, malformed processor requests, and session/auth failures. | ✓ |
| Error-code categories | Very narrow | Only unsupported_method and invalid_request for Phase 1. Minimal but may need churn later. | |
| Error-code categories | Full taxonomy now | Add codes for Nuvei, CT, webhook, operation, timeout, and reconciliation errors now. Broader than Phase 1. | |
| State-creation guarantee | No external state before validation | Reject invalid config/method/request before Nuvei openOrder or CT Payment creation. Matches the phase success criteria. | ✓ |
| State-creation guarantee | Allow recoverable CT draft | Permit local CT Payment draft creation for some errors, but never call Nuvei. More complex and not needed for contract hardening. | |
| State-creation guarantee | You decide | Let planner choose the safest validation boundary consistent with requirements. | |

**User's choice:** Structured code + message; safe public responses with richer redacted logs; config/method/request/auth code categories; no external state before validation.
**Notes:** This locks the no-Nuvei/no-CT-state guarantee for invalid setup.

---

## Method Registry

| Question | Option | Description | Selected |
|----------|--------|-------------|----------|
| Registry source of truth | Shared package/module | One registry consumed by processor and enabler. Strongest alignment, but may require workspace/build wiring. | |
| Registry source of truth | Mirrored registries with tests | Keep processor/enabler registries separate but add tests that enforce exact alignment. Smaller cutover. | ✓ |
| Registry source of truth | Processor authoritative | Processor advertises methods; enabler keeps local builders. Good runtime truth, but still risks build-time drift. | |
| Registry entry definition | ID, display, type, builder | Method ID, display label, component/drop-in kind, and enabler/processor support mapping. Enough for this phase. | |
| Registry entry definition | ID only | Only enforce card/dropin IDs. Minimal but leaves labels and advertised component shape scattered. | |
| Registry entry definition | Full PSP metadata | Include Nuvei-specific request options, 3DS requirements, operations support, and metadata. Better for later phases, too broad now. | ✓ |
| Nuvei-specific metadata depth | Shape now, values later | Add fields/placeholders for PSP metadata but only populate evidence-backed basics. Nuvei specifics wait for Phase 2. | ✓ |
| Nuvei-specific metadata depth | Fill all now | Planner should infer Nuvei params now. Faster, but risks locking unproven behavior. | |
| Nuvei-specific metadata depth | No PSP metadata | Back down to simple method metadata only. | |
| Embedded drop-in representation | Supported but transitional | Keep advertised for now, label as transitional, require same validation and tests as card where it remains exposed. | ✓ |
| Embedded drop-in representation | Production-supported | Treat embedded drop-in as equal to card in the public contract. | |
| Embedded drop-in representation | Stop advertising | Remove from /payment-components and enabler support until later evidence. | |
| Registry alignment proof | Contract parity test | Assert processor /payment-components output, processor supported methods, and enabler supported methods agree for every exposed method. | ✓ |
| Registry alignment proof | Unit tests only | Test each side separately. Easier but may miss drift between processor and enabler. | |
| Registry alignment proof | Snapshot advertised output | Snapshot /payment-components only. Useful, but does not prove enabler can build each advertised method. | |

**User's choice:** Mirrored registries with contract parity tests; registry shape can anticipate PSP metadata, but real Nuvei metadata values wait for evidence; embedded drop-in remains supported but transitional.
**Notes:** Assistant explicitly warned that filling full Nuvei PSP metadata now would overreach Phase 1 without sandbox evidence. User accepted the safer “shape now, values later” interpretation.

---

## Claude's Discretion

- Exact TypeScript structure for mirrored registry entries.
- Exact names of constants/helpers, as long as public behavior and tests enforce the decisions.

## Deferred Ideas

- Final Nuvei PSP metadata values.
- Long-term production status of embedded drop-in.
- Wallets, APMs, express payments, and stored payment methods.
