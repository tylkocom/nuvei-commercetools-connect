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

The processor has several Checkout-compatible route shapes, but the browser enabler is not currently template-compatible enough for the commercetools whitelabel Checkout page.

The highest-risk discrepancy is the default enabler surface. The template publishes a named `Enabler` export and builds a UMD global named `Connector`; our bundle exports `NuveiEnabler` under a UMD global named `NuveiEnabler`, requires a second constructor argument, and requires Nuvei merchant configuration in the constructor. A Checkout integration written against the template-style contract can fail before rendering any payment UI.

Use the current implementation as a Nuvei-specific harness, not as the Checkout-facing contract. Add a template-compatible adapter as the clean cutover path.

## Compatibility map

| Area | Template behavior | Current Nuvei behavior | Parity |
| --- | --- | --- | --- |
| Public enabler export | `export { MockPaymentEnabler as Enabler }` from `enabler/src/main.ts`. | Exports `NuveiEnabler`, `NuveiSimplyConnectEnabler`, `NuveiWebSdkEnabler`; no `Enabler` export. | Broken. |
| UMD global | Vite `lib.name = "Connector"`. | Vite `lib.name = "NuveiEnabler"`; built UMD assigns `globalThis.NuveiEnabler`. | Broken for template-style UMD loading. |
| Constructor | `new Enabler({ processorUrl, sessionId, locale?, countryCode?, onComplete?, onError? })`. | `new NuveiEnabler(opts, "simply-connect" | "web-sdk")`; `opts` requires `merchantId`, `merchantSiteId`, `env`. | Broken for template-style instantiation. |
| Runtime config | Enabler fetches `GET /operations/config` with `X-Session-Id` during setup. | Processor exposes `/operations/config`, but enabler does not call it. | Broken/incomplete. |
| Component builder | `createComponentBuilder(type)` plus drop-in, express, and stored-payment builders. | `createComponentBuilder(type)` only. | Card-only is acceptable if only card is advertised; interface is incomplete. |
| Component lifecycle | `mount(selector): Promise<void>`, `submit({ storePaymentDetails? }): Promise<void>`. | `mount(selector): void` with async work fire-and-forget; `submit(): void`. | Risky. |
| `componentHasSubmit` handling | Checkout/harness uses it to decide whether the host or component owns the Pay button. | Web SDK uses `true`; Simply Connect uses `false` but ignores `showPayButton` and `onPayButtonClick`. | Web SDK closer; Simply Connect mismatched. |
| Payment callback shape | `onComplete({ isSuccess, paymentReference })`; `onError(error, { paymentReference? })`. | Success includes `sessionToken`; rejection goes to `onError`; pending goes to non-template `onPending`. | Mismatched. |
| Enabler processor calls | Template enabler calls `/payments`, `/stored-payment-methods`, `/operations/config`. | Nuvei enabler calls `/payments/session`, `/payments/confirm/:id`; no stored route calls. | Different by PSP design; OK if hidden behind compatible enabler. |
| Payment components route | `/operations/payment-components` returns `{ dropins, components, express }`. | Same shape; advertises card only. | Compatible for card-only. |

## Findings

### F-01 — Critical: default enabler export/global is not template-compatible

Evidence:

- Template entry exports `Enabler`: `payment-template/enabler/src/main.ts:1-3`.
- Template Vite library name is `Connector`: `payment-template/enabler/vite.config.ts:33-42`.
- Local entry exports Nuvei-specific class names only: `enabler/src/index.ts:22-71`.
- Local Vite library name is `NuveiEnabler`: `enabler/vite.config.ts:8-12`.
- Local built UMD assigns `globalThis.NuveiEnabler`, not `globalThis.Connector`: `enabler/public/connector-enabler.umd.js:1`.

Impact:

A whitelabel Checkout page or loader that expects the payment-template surface cannot reliably instantiate this connector. The likely failures are `Connector` missing, `Connector.Enabler` missing, or named ESM export `Enabler` missing.

Recommendation:

Publish a template-compatible entry point:

- Export a class named `Enabler`.
- Build the UMD bundle with `lib.name = "Connector"`.
- Keep existing `Nuvei*` exports as aliases for custom storefronts, but make `Enabler` the Checkout-facing default.

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

### F-03 — Critical: `NuveiEnabler` requires a mode argument the template does not provide

Evidence:

- Template instantiates with one argument: `new Enabler({ processorUrl, sessionId, ... })` in `payment-template/enabler/index.html:258-269`.
- Local facade requires a second `mode` argument and throws when it is missing: `enabler/src/index.ts:54-66`; tests assert undefined mode throws at `enabler/test/unit/payment-enabler.test.ts:143-161`.

Impact:

A Checkout integration following the template can fail immediately with `METHOD_UNSUPPORTED` before config fetch, SDK load, or payment rendering.

Recommendation:

The Checkout-facing `Enabler` should be one-argument. Choose the Nuvei mode from processor config or a stable connector setting. For whitelabel Checkout, prefer the Web SDK component path unless Simply Connect is made to respect the template's internal-button lifecycle and validation callback contract.

### F-04 — High: enabler interface omits template methods for drop-ins, express, and stored payment methods

Evidence:

- Template `PaymentEnabler` includes `createDropinBuilder`, `createStoredPaymentMethodBuilder`, `createExpressBuilder`, `isStoredPaymentMethodsEnabled`, `getStoredPaymentMethods`, and `setStorePaymentDetails`: `payment-template/enabler/src/payment-enabler/payment-enabler.ts:30-95`.
- Local `PaymentEnabler` only exposes `createComponentBuilder`: `enabler/src/payment-enabler/payment-enabler.ts:136-138`.
- Local processor advertises only card components: `processor/src/services/nuvei-payment.service.ts:492-501`.

Impact:

Card-only Checkout can work without advertising drop-ins/express/stored methods, but a generic Checkout code path may still probe for template methods, and future stored-card support cannot be added without another public-interface cutover.

Recommendation:

Implement the full template `PaymentEnabler` surface on the Checkout-facing adapter. Unsupported methods can throw clear unsupported errors, but the methods should exist. Keep `/operations/payment-components` authoritative for what Checkout should render.

### F-05 — High: `mount` and `submit` are fire-and-forget instead of awaited lifecycle operations

Evidence:

- Template component contract returns promises for `mount` and `submit`: `payment-template/enabler/src/payment-enabler/payment-enabler.ts:108-146`.
- Template local checkout harness awaits `component.mount(...)` and `component.submit(...)`: `payment-template/enabler/index.html:219-235`.
- Local component contract uses `mount(selector): void` and `submit(): void`: `enabler/src/payment-enabler/payment-enabler.ts:143-155`.
- Local `mount` starts async initialization but returns immediately: `enabler/src/components/simply-connect-card.ts:40-42`, `enabler/src/components/web-sdk-card.ts:43-45`.
- Local Web SDK `submit` can throw if async mount has not completed: `enabler/src/components/web-sdk-card.ts:47-66`.

Impact:

Checkout can believe the component is mounted while SDK loading and payment-session creation are still in progress. In Web SDK mode, a fast user click or host-driven submit can race initialization and throw `not mounted yet`.

Recommendation:

Return `Promise<void>` from `mount` and `submit`. Store a single initialization promise per component, await it from `mount`, and have `submit` await it before using SDK fields. Accept the template submit argument even if card tokenization is not implemented yet: `submit({ storePaymentDetails } = {})`.

### F-06 — High: Simply Connect does not honor `showPayButton` / `onPayButtonClick`

Evidence:

- Template builders expose `componentHasSubmit`; host code passes `showPayButton` and `onPayButtonClick` when the component owns submission: `payment-template/enabler/index.html:271-298`.
- Template card component uses `showPayButton` to render a pay button and wire click handling: `payment-template/enabler/src/components/payment-methods/card/card.ts:34-62`.
- Local Simply Connect builder reports `componentHasSubmit = false`: `enabler/src/components/simply-connect-card.ts:14-21`.
- Local Simply Connect component never reads `componentOptions.showPayButton` or `componentOptions.onPayButtonClick`: `enabler/src/components/simply-connect-card.ts:30-98`.

Impact:

If Checkout treats `componentHasSubmit = false` as “the connector renders and controls its own pay button”, it can pass validation or terms gating through `onPayButtonClick`. The Simply Connect path currently bypasses that host callback entirely because Nuvei's widget owns the button.

Recommendation:

For whitelabel Checkout, either:

1. expose card through Web SDK mode with `componentHasSubmit = true`, so Checkout owns the Pay button; or
2. adapt Simply Connect so its internal payment initiation is gated by the provided callback before Nuvei payment submission proceeds.

Do not make Simply Connect the default Checkout-facing mode until this is resolved.

### F-07 — High: callback result shape does not match the template and leaks session token

Evidence:

- Template `PaymentResult` contains only `isSuccess` and `paymentReference`: `payment-template/enabler/src/payment-enabler/payment-enabler.ts:246-268`.
- Local success result includes `sessionToken`: `enabler/src/payment-enabler/payment-enabler.ts:196-198`.
- Local `confirmPaymentResult` passes `sessionToken` to `onComplete` and `onPending`: `enabler/src/services/api-service.ts:88-109`.
- Local README example logs `result.sessionToken`: `README.md:75-78`.

Impact:

The callback payload diverges from the template and exposes a Nuvei session token to host callback code. The token is already present in the browser to run Nuvei, but passing it into public completion callbacks and documenting logging makes accidental exposure more likely.

Recommendation:

Match the template callback shape for `onComplete`. Do not include `sessionToken` in `PaymentResult` or documentation examples. If pending state must be exposed, use `{ paymentReference }` only and document the behavior as a Nuvei extension.

### F-08 — High: pending outcomes can produce no Checkout callback

Evidence:

- Local tri-state handling sends `pending` only to optional `onPending`: `enabler/src/services/api-service.ts:107-109`.
- Template `EnablerOptions` has no `onPending` callback: `payment-template/enabler/src/payment-enabler/payment-enabler.ts:168-207`.

Impact:

If whitelabel Checkout supplies only the template callbacks, a Nuvei pending confirmation can result in no `onComplete` and no `onError`. That can leave the Checkout payment UI waiting indefinitely unless Checkout has Nuvei-specific pending support.

Recommendation:

Define the Checkout-facing pending behavior explicitly before sandbox E2E. If Checkout cannot consume `onPending`, map pending to a documented template-compatible callback path that keeps the UI recoverable without misrepresenting the payment as terminally failed or approved.

### F-09 — Mitigated: Nuvei DMN correlation now has a session-token fallback

Evidence:

- Payment session creation calls `openOrder` with `clientUniqueId: cart.id`: `processor/src/services/nuvei-payment.service.ts:828-841`.
- Web SDK browser submission sends `clientUniqueId` as the cart ID returned by `POST /payments/session`: `enabler/src/components/web-sdk-card.ts`.
- CT Payment creation stores the Nuvei session token as `Payment.interfaceId`: `processor/src/services/ct-payment-creation.service.ts:38-67`.
- DMN processing now resolves by `merchant_unique_id` when it is a CT Payment ID, otherwise falls back to `sessionToken -> Payment.interfaceId`; zero or multiple matches are rejected: `processor/src/services/nuvei-payment.service.ts`.

Impact:

This removes the unsafe overloading where `clientUniqueId` tried to be both cart ID and CT Payment ID. Cart/session correlation stays on `clientUniqueId`; exact Payment correlation uses `merchant_unique_id` when Nuvei provides it as a CT Payment ID, with session-token lookup as the boring-safe fallback.

Follow-up:

Sandbox evidence is still required to record real Nuvei field behavior for Web SDK and Simply Connect: `merchant_unique_id`, `sessionToken`, `clientUniqueId`, `PPP_TransactionID`, fiscal `TransactionID`, `Status`, `ppp_status`, amount, and currency. If Nuvei can reliably echo a dedicated CT Payment reference field, prefer that over relying on session-token fallback as the primary path.

### F-10 — Medium: shopper country and billing data are hard-coded in the enabler

Evidence:

- Template options include `locale` and `countryCode`: `payment-template/enabler/src/payment-enabler/payment-enabler.ts:180-187`.
- Local Simply Connect hard-codes `country: "US"` and `billingAddress.email = "test@example.com"`: `enabler/src/components/simply-connect-card.ts:78-95`.
- Local Web SDK hard-codes `sandbox@example.com` and `US`: `enabler/src/components/web-sdk-card.ts:52-61`.

Impact:

Whitelabel Checkout collects real billing/shipping data. Hard-coded shopper data can break 3DS, fraud checks, localization, country-specific cards, and future APM eligibility.

Recommendation:

Source shopper country/billing data from the authenticated session/cart in the processor or from explicit Checkout-provided component options. Do not keep browser hard-coded values in the Checkout-facing path.

### F-11 — Medium: validation/state methods are weaker than the template contract

Evidence:

- Template component interface includes optional `showValidation`, `isValid`, `getState`, and `isAvailable`: `payment-template/enabler/src/payment-enabler/payment-enabler.ts:124-145`.
- Template card implements validation and state extraction: `payment-template/enabler/src/components/payment-methods/card/card.ts:175-195`.
- Local interface omits `showValidation`; local Simply Connect `isValid` only checks mounted state: `enabler/src/payment-enabler/payment-enabler.ts:143-155`, `enabler/src/components/simply-connect-card.ts:48-59`.
- Local Web SDK `isValid` only checks that the card field exists: `enabler/src/components/web-sdk-card.ts:68-74`.

Impact:

Checkout may use these methods to control button enablement, display validation, or summarize card state. Returning “valid” for mounted/existing SDK fields is not the same as validating card input.

Recommendation:

Implement the template optional methods where the Nuvei SDK supports them. Where Nuvei iframe state cannot be inspected safely, return conservative values and rely on SDK validation at submit time.

### F-12 — Medium: raw Nuvei widget result is logged in the browser

Evidence:

- `handleCheckoutResult` logs the full Simply Connect result: `enabler/src/components/simply-connect-card.ts:100-108`.
- The result type can include `sessionToken`, `userPaymentOptionId`, `ccCardNumber`, BIN, and last-four fields: `enabler/src/services/simply-connect-sdk.ts:6-19`.

Impact:

This is unsafe for a shopper-facing Checkout page and contradicts the project constraint that session tokens and sensitive payment data must not be exposed or logged unsafely.

Recommendation:

Remove the raw console log. If browser diagnostics are needed during sandbox work, log only redacted, non-sensitive fields behind an explicit development flag that cannot be enabled in production Checkout.

### F-13 — Low: Simply Connect SDK loader cannot retry after a failed first load

Evidence:

- `loadSimplyConnectSdk` caches `scLoadPromise`: `enabler/src/services/simply-connect-sdk.ts:46-87`.
- Unlike `loadWebSdk`, it does not clear the cached promise in `finally`: `enabler/src/services/web-sdk.ts:48-106`.

Impact:

A transient CDN or network failure can poison the page for the rest of the session. Subsequent attempts reuse the rejected promise instead of reinjecting/retrying the script.

Recommendation:

Mirror the Web SDK loader pattern and clear `scLoadPromise` after rejection/completion as appropriate.

## What is already close to template-compatible

- Processor exposes `/operations/config`, `/operations/status`, `/operations/payment-components`, `/operations/payment-intents/:id`, and `/operations/transactions` with the same broad auth split as the template: `processor/src/routes/operation.route.ts:39-158`.
- Processor advertises the standard `{ dropins, components, express }` payment-components response shape: `processor/src/dtos/operations/payment-components.dto.ts:77-83`.
- Card-only advertisement is consistent with the project's card-first scope, as long as the enabler only exposes card to Checkout: `processor/src/services/nuvei-payment.service.ts:492-501`.
- Web SDK mode is closer to the template's external-submit model because it sets `componentHasSubmit = true`: `enabler/src/components/web-sdk-card.ts:16-23`.

## Recommended clean cutover

1. Add a Checkout-facing `Enabler` adapter and export it from the enabler entry.
2. Change Vite UMD `lib.name` to `Connector`; keep the output filenames unchanged.
3. Make the adapter constructor one-argument and template-compatible. Fetch Nuvei config through `GET /operations/config`.
4. Default whitelabel Checkout to a card builder with `componentHasSubmit = true` unless Simply Connect is adapted to honor `showPayButton` and `onPayButtonClick`.
5. Align component lifecycle signatures to promises and accept the template submit parameter object.
6. Match template callback payloads; remove session tokens from public callback results and docs.
7. Resolve Nuvei DMN correlation with real sandbox evidence before relying on whitelabel Checkout for payment completion.
8. Add parity tests:
   - ESM bundle exports named `Enabler`.
   - UMD bundle exposes `Connector.Enabler`.
   - `new Enabler({ processorUrl, sessionId })` does not require merchant config or a mode argument.
   - `mount()` awaits config/session/SDK initialization.
   - `submit({ storePaymentDetails })` is accepted and awaited.
   - Pending/rejected/approved outcomes produce documented Checkout-compatible callbacks.
   - Browser code does not log raw Nuvei results or pass session tokens to `onComplete`.

## Blocking questions for final whitelabel certification

These need sandbox or actual whitelabel Checkout evidence, not code inspection alone:

1. Does commercetools whitelabel Checkout load the UMD asset through `Connector.Enabler`, an ESM named `Enabler`, or another loader wrapper?
2. Does whitelabel Checkout call only builders advertised by `/operations/payment-components`, or does it probe optional template methods regardless of advertisement?
3. How does whitelabel Checkout expect non-terminal pending payment states to be represented if the template has no `onPending` callback?
4. Which Nuvei browser/server field is echoed into DMN `merchant_unique_id` for the card flow actually used here?
