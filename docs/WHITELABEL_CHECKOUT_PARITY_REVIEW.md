# Whitelabel Checkout Payment-Template Parity Review

## Scope

Compared this repository against `/home/wykwit/Documents/WORK/scratchpad/ct-connect/payment-template`, with emphasis on the browser enabler contract used by commercetools Checkout and the processor routes the enabler depends on.

Primary references:

- Template enabler entry and contract: `payment-template/enabler/src/main.ts`, `payment-template/enabler/src/payment-enabler/payment-enabler.ts`, `payment-template/enabler/src/payment-enabler/payment-enabler-mock.ts`.
- Template local checkout harness: `payment-template/enabler/index.html`.
- Template processor routes: `payment-template/processor/src/routes/operation.route.ts`, `payment-template/processor/src/routes/mock-payment.route.ts`.
- Local enabler and processor: `enabler/src/index.ts`, `enabler/src/payment-enabler/payment-enabler.ts`, `enabler/src/components/*.ts`, `enabler/src/services/*.ts`, `processor/src/routes/*.ts`, `processor/src/services/nuvei-payment.service.ts`.
- commercetools payment-template docs: https://docs.commercetools.com/connect/templates/payment-integration

## Implementation status

The main template-compatibility gaps identified below have been addressed in the enabler implementation: `Enabler` is now exported, the UMD bundle uses the `Connector` global, the Checkout-facing constructor accepts template-style options and fetches Nuvei config from `GET /operations/config`, card lifecycle methods are promise-based, Web SDK is the default Checkout-facing card path, and public completion/pending callbacks no longer expose the Nuvei session token. The current boring-safe correlation strategy keeps Nuvei `clientUniqueId` as the commercetools cart ID and resolves DMNs by `merchant_unique_id` when it is a CT Payment ID, otherwise by `sessionToken -> Payment.interfaceId`. Remaining production follow-up is sandbox evidence confirming which Nuvei fields are present in real card DMNs for Web SDK and Simply Connect.

## Executive verdict

The browser enabler now exposes the template-compatible Checkout entry point. `Enabler` is the single Checkout-facing adapter: Checkout selects a configured Web Components integration and calls `createComponentBuilder("card")`, or selects a Drop-in integration and calls `createDropinBuilder("embedded")`.

The previous Nuvei-specific facade classes have been removed from the public entry point. Remaining production follow-up is sandbox evidence for real Nuvei Web SDK and Simply Connect callback/DMN fields.

## Compatibility map

| Area | Template behavior | Current Nuvei behavior | Parity |
| --- | --- | --- | --- |
| Public enabler export | `export { MockPaymentEnabler as Enabler }` from `enabler/src/main.ts`. | Exports `Enabler` from `enabler/src/index.ts`; no Nuvei-specific enabler facade is required. | Compatible. |
| UMD global | Vite `lib.name = "Connector"`. | Vite `lib.name = "Connector"`; built UMD assigns `globalThis.Connector`. | Compatible. |
| Constructor | `new Enabler({ processorUrl, sessionId, locale?, countryCode?, onComplete?, onError? })`. | `new Enabler({ processorUrl, sessionId, locale?, countryCode?, onComplete?, onError?, onPending? })`; Nuvei merchant config is fetched from the processor. | Compatible. |
| Runtime config | Enabler fetches `GET /operations/config` with `X-Session-Id` during setup. | Checkout-facing `Enabler` fetches `/operations/config` before building card or drop-in UI. | Compatible. |
| Component builder | `createComponentBuilder(type)` plus drop-in, express, and stored-payment builders. | `createComponentBuilder("card")` and `createDropinBuilder("embedded")` are implemented; express/stored methods reject safely. | Compatible for supported surfaces. |
| Component lifecycle | `mount(selector): Promise<void>`, `submit({ storePaymentDetails? }): Promise<void>`. | Card and drop-in components return promises; drop-in `submit()` rejects defensively because Nuvei owns the internal pay button. | Compatible. |
| `componentHasSubmit` / `dropinHasSubmit` handling | Checkout/harness uses submit flags to decide whether host or PSP owns the Pay button. | Web SDK card uses `componentHasSubmit = true`; Simply Connect drop-in uses `dropinHasSubmit = false` and gates through `prePayment`. | Compatible. |
| Payment callback shape | `onComplete({ isSuccess, paymentReference })`; `onError(error, { paymentReference? })`. | Browser callbacks expose safe template-compatible result/context payloads and do not forward Nuvei session tokens. | Compatible. |
| Enabler processor calls | Template enabler calls `/payments`, `/stored-payment-methods`, `/operations/config`. | Nuvei enabler calls `/operations/config`, `/payments/session`, and `/payments/confirm/:id`; no stored route calls. | Different by PSP design; OK behind compatible enabler. |
| Payment components route | `/operations/payment-components` returns `{ dropins, components, express }`. | Same shape; advertises Drop-in `embedded` and Web Components `card`. | Compatible. |

## Findings

### F-01 — Resolved: default enabler export/global is template-compatible

Evidence:

- Template entry exports `Enabler`: `payment-template/enabler/src/main.ts:1-3`.
- Template Vite library name is `Connector`: `payment-template/enabler/vite.config.ts:33-42`.
- Local entry exports `Enabler`: `enabler/src/index.ts`.
- Local Vite library name is `Connector`: `enabler/vite.config.ts:8-12`.
- Local built UMD assigns `globalThis.Connector`.

Impact:

The ESM and UMD entry points now match the template-facing names.

Recommendation:

Keep `Enabler` as the only Checkout-facing enabler class.

### F-02 — Critical: constructor options require PSP details that should come from the processor

Evidence:

- Template `EnablerOptions` requires `processorUrl` and `sessionId`; `locale`, `countryCode`, callbacks are optional: `payment-template/enabler/src/payment-enabler/payment-enabler.ts:168-207`.
- Template setup fetches processor config with the session header: `payment-template/enabler/src/payment-enabler/payment-enabler-mock.ts:61-119`.
- Local `EnablerOptions` requires `merchantId`, `merchantSiteId`, and `env`: `enabler/src/payment-enabler/payment-enabler.ts:168-191`.
- Local validation rejects missing merchant/env fields: `enabler/src/payment-enabler/payment-enabler.ts:89-117`.
- Local processor already exposes safe Nuvei config: `processor/src/services/nuvei-payment.service.ts:393-399`.

Impact:

Checkout should not need to know Nuvei merchant IDs or environment to construct the enabler. Those values are Connect configuration, not shopper-page configuration. Requiring them in the constructor makes the enabler harder to use in whitelabel Checkout and increases the chance of leaking deployment configuration into storefront code.

Recommendation:

Make `new Enabler(options)` accept the template-style options. Fetch `GET /operations/config` during enabler setup and use that response to configure Nuvei SDK loading. If a custom storefront still wants to pass explicit Nuvei config, keep it as an override on Nuvei-specific aliases, not as the Checkout-facing required path.

### F-03 — Resolved: no mode argument is required

Evidence:

- Template instantiates with one argument: `new Enabler({ processorUrl, sessionId, ... })` in `payment-template/enabler/index.html:258-269`.
- Local `Enabler` takes one template-style options object; Checkout selects card versus drop-in through `createComponentBuilder("card")` or `createDropinBuilder("embedded")`.

Impact:

Checkout can instantiate the enabler without Nuvei-specific mode knowledge.

Recommendation:

Keep routing in `Enabler`; do not reintroduce provider-specific enabler facades for Checkout.

### F-04 — High: enabler interface omits template methods for drop-ins, express, and stored payment methods

Evidence:

- Template `PaymentEnabler` includes `createDropinBuilder`, `createStoredPaymentMethodBuilder`, `createExpressBuilder`, `isStoredPaymentMethodsEnabled`, `getStoredPaymentMethods`, and `setStorePaymentDetails`: `payment-template/enabler/src/payment-enabler/payment-enabler.ts:30-95`.
- Local `PaymentEnabler` only exposes `createComponentBuilder`: `enabler/src/payment-enabler/payment-enabler.ts:136-138`.
- Local processor advertises only card components: `processor/src/services/nuvei-payment.service.ts:492-501`.

Impact:

Card-only Checkout can work without advertising drop-ins/express/stored methods, but a generic Checkout code path may still probe for template methods, and future stored-card support cannot be added without another public-interface cutover.

Recommendation:

Implement the full template `PaymentEnabler` surface on the Checkout-facing adapter. Unsupported methods can throw clear unsupported errors, but the methods should exist. Keep `/operations/payment-components` authoritative for what Checkout should render.

### F-05 — Mitigated: lifecycle methods are promise-based

Evidence:

- Checkout-facing wrapper awaits delegated `mount` and `submit` calls: `enabler/src/payment-enabler/checkout-enabler.ts`.
- Web SDK card and Simply Connect drop-in both expose async lifecycle methods through the shared Checkout delegate.
- The Simply Connect drop-in memoizes initialization and resets the promise after initialization failure, so transient config/SDK errors can be retried.

Residual risk:

Whitelabel Checkout behavior still needs browser evidence, but the local component contract no longer returns before async SDK/session initialization completes.

### F-06 — Mitigated: Simply Connect drop-in gates Nuvei payment start through `prePayment`

Evidence:

- Simply Connect is exposed as a drop-in with `dropinHasSubmit = false`, matching the PSP-owned-button model.
- The drop-in passes a Nuvei `prePayment` callback and awaits Checkout's `onPayButtonClick` before resolving Nuvei's payment start.
- Failed host gating rejects Nuvei payment start with a generic shopper-safe message and reports the original host error only through `onError`.

Residual risk:

This is compatible with a drop-in path, not a card-component path. The Web SDK card remains the external-submit component path with `componentHasSubmit = true`.

### F-07 — Mitigated: completion callbacks no longer expose session tokens

Evidence:

- Template `PaymentResult` contains only `isSuccess` and `paymentReference`: `payment-template/enabler/src/payment-enabler/payment-enabler.ts:246-268`.
- Local `PaymentResult` now matches that shape for completion callbacks.
- `confirmPaymentResult` uses the processor-side session token internally but passes only `{ isSuccess, paymentReference }` to `onComplete`, and `{ paymentReference }` to `onPending`.
- README examples no longer instruct callers to log the Nuvei session token.

Residual risk:

Nuvei's browser result object can still contain tokens or card metadata; keep it internal to the drop-in and never forward it to host callbacks.

### F-08 — High: pending outcomes can produce no Checkout callback

Evidence:

- Local tri-state handling sends `pending` only to optional `onPending`: `enabler/src/services/api-service.ts:107-109`.
- Template `EnablerOptions` has no `onPending` callback: `payment-template/enabler/src/payment-enabler/payment-enabler.ts:168-207`.

Impact:

If whitelabel Checkout supplies only the template callbacks, a Nuvei pending confirmation can result in no `onComplete` and no `onError`. That can leave the Checkout payment UI waiting indefinitely unless Checkout has Nuvei-specific pending support.

Recommendation:

Define the Checkout-facing pending behavior explicitly before sandbox E2E. If Checkout cannot consume `onPending`, map pending to a documented template-compatible callback path that keeps the UI recoverable without misrepresenting the payment as terminally failed or approved.

### F-09 — Mitigated: Nuvei DMN correlation has layered fallbacks

Evidence:

- Payment session creation calls `openOrder` with `clientUniqueId: cart.id`: `processor/src/services/nuvei-payment.service.ts`.
- Web SDK browser submission sends `clientUniqueId` as the cart ID and sends the CT Payment reference through Nuvei merchant-reference aliases: `enabler/src/components/web-sdk-card.ts`.
- CT Payment creation stores the Nuvei session token as `Payment.interfaceId`: `processor/src/services/ct-payment-creation.service.ts`.
- DMN processing resolves by `merchant_unique_id` when it is a CT Payment ID, by `sessionToken -> Payment.interfaceId` when available, and by linked cart Payments plus existing Nuvei transaction identity when Nuvei sends the cart ID as `merchant_unique_id`: `processor/src/services/nuvei-payment.service.ts`.

Impact:

This removes the unsafe overloading where `clientUniqueId` tried to be both cart ID and CT Payment ID. Cart/session correlation stays on `clientUniqueId`; exact Payment correlation uses the CT Payment reference when Nuvei echoes it, then session-token lookup, then transaction-identity disambiguation for cart-referenced DMNs left by earlier or Nuvei-normalized flows.

Follow-up:

Sandbox evidence is still required to record real Nuvei field behavior for Web SDK and Simply Connect: `merchant_unique_id`, `sessionToken`, `clientUniqueId`, `PPP_TransactionID`, fiscal `TransactionID`, `Status`, `ppp_status`, amount, and currency. If Nuvei can reliably echo a dedicated CT Payment reference field, prefer that over relying on session-token fallback as the primary path.

### F-10 — Mitigated for Simply Connect: shopper country/email are no longer hard-coded test values

Evidence:

- Simply Connect drop-in uses `baseOptions.countryCode` with a conservative `US` fallback and passes `baseOptions.shopperEmail` only when provided.
- Web SDK card still uses browser-provided Checkout options/fallbacks and should be verified in sandbox for 3DS/fraud field sufficiency.

Residual risk:

Whitelabel Checkout must still prove which billing/shipping fields it provides to the enabler versus what must be sourced server-side from the authenticated cart.

### F-11 — Partially mitigated: validation/state methods exist but are SDK-limited

Evidence:

- Checkout-facing delegate exposes `showValidation`, `isValid`, `getState`, and `isAvailable` for both card and drop-in builders.
- Simply Connect hosted validation remains Nuvei-controlled; local `isValid` can only confirm the widget is mounted.
- Web SDK card validation remains limited by what the Nuvei iframe exposes safely.

Residual risk:

Checkout may use these methods for button enablement or validation display. Sandbox evidence is still needed to confirm whether mounted-state validation is sufficient for the whitelabel host.

### F-12 — Mitigated: raw Nuvei widget results are not logged or forwarded

Evidence:

- The deleted Simply Connect card path no longer logs raw checkout results.
- The Simply Connect drop-in confirms payment through the processor using the session token returned by `POST /payments/session`; it does not forward browser result tokens to `onComplete`.
- Widget errors are reported to public callbacks with a generic message plus an allowlisted diagnostic `name`/`code` cause only.

Residual risk:

Do not enable browser diagnostics that print raw Nuvei callback payloads. Those payloads can contain session tokens, UPO identifiers, BIN, last-four, or card fragments depending on Nuvei behavior.

### F-13 — Mitigated: Simply Connect SDK loader retries and times out safely

Evidence:

- Failed script loads remove the script element and clear the cached loader promise, allowing retry.
- A bounded SDK-load timeout now removes both newly-created and pre-existing script tags if `checkout.js` never resolves `window.checkout`.

Residual risk:

Sandbox browser evidence is still needed for CDN failure and recovery behavior under real network conditions.

## What is already close to template-compatible

- Processor exposes `/operations/config`, `/operations/status`, `/operations/payment-components`, `/operations/payment-intents/:id`, and `/operations/transactions` with the same broad auth split as the template: `processor/src/routes/operation.route.ts:39-158`.
- Processor advertises the standard `{ dropins, components, express }` payment-components response shape: `processor/src/dtos/operations/payment-components.dto.ts:77-83`.
- The current advertisement is card-first but no longer card-only: `dropins: [{ type: "embedded" }]`, `components: [{ type: "card" }]`, and `express: []`. Non-card APMs remain disabled by the Simply Connect `pmWhitelist`.
- Web SDK mode remains the external-submit model (`componentHasSubmit = true`); the Simply Connect drop-in is the Merchant Center-compatible PSP-submit model (`dropinHasSubmit = false`).

## Recommended clean cutover

1. Keep the Checkout-facing `Enabler` adapter as the only Merchant Center entry point.
2. Keep Vite UMD `lib.name` aligned with the commercetools loader contract once confirmed in whitelabel evidence.
3. Keep the adapter constructor one-argument and template-compatible. Fetch Nuvei config through `GET /operations/config`.
4. Use Web SDK `card` for external-submit card components and Simply Connect `embedded` for the Merchant Center-compatible drop-in path.
5. Preserve promise-based lifecycle methods and template submit parameter compatibility.
6. Keep public callback payloads template-shaped; never pass session tokens to `onComplete`.
7. Resolve any remaining Nuvei DMN field ambiguity with real sandbox evidence before production claims.
8. Maintain parity tests:
   - ESM bundle exports named `Enabler`.
   - UMD bundle exposes the confirmed commercetools loader global.
   - `new Enabler({ processorUrl, sessionId })` does not require merchant config or a mode argument.
   - `mount()` awaits config/session/SDK initialization.
   - `submit({ storePaymentDetails })` is accepted and awaited where the component owns submit.
   - Pending/rejected/approved outcomes produce documented Checkout-compatible callbacks.
   - Browser code does not log raw Nuvei results or pass session tokens to `onComplete`.

## Blocking questions for final whitelabel certification

These need sandbox or actual whitelabel Checkout evidence, not code inspection alone:

1. Does commercetools whitelabel Checkout load the UMD asset through `Connector.Enabler`, an ESM named `Enabler`, or another loader wrapper?
2. Does whitelabel Checkout call only builders advertised by `/operations/payment-components`, or does it probe optional template methods regardless of advertisement?
3. How does whitelabel Checkout expect non-terminal pending payment states to be represented if the template has no `onPending` callback?
4. Which Nuvei browser/server field is echoed into DMN `merchant_unique_id` for the card flow actually used here?
