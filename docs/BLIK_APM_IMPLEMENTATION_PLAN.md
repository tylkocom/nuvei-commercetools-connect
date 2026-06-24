# Plan: BLIK APM implementation

## Decision

Implement first production-quality BLIK support through **Nuvei Simply Connect v1**, not through a custom Nuvei Web SDK BLIK component.

The lowest-risk path in this repository is to reuse the existing commercetools Checkout `DropIn` surface (`embedded`) and the existing `SimplyConnectDropinComponent`, then switch that drop-in to a BLIK-only Nuvei method mode with `pmWhitelist: ["apmgw_BLIK"]`. Keep Web SDK as the card-only component path.

Why this is the easiest reliable path here:

- The project already has a Checkout-compatible Simply Connect drop-in: `enabler/src/components/simply-connect-dropin.ts` loads `checkout.js`, calls `checkout(...)`, gates Nuvei's internal pay button through `prePayment`, and confirms through the processor.
- The processor already has the hard parts BLIK must reuse: `POST /payments/session`, cart freeze, Nuvei `/openOrder`, CT Payment creation, `POST /payments/confirm/:id`, `/getPaymentStatus`, and DMN reconciliation in `processor/src/services/nuvei-payment.service.ts`.
- Nuvei's Simply Connect product owns the BLIK entry UI, code validation, payment-method display, and APM-specific field collection. A Web SDK BLIK path would require this connector to build and maintain BLIK UI and direct APM submission behavior itself.
- BLIK is asynchronous enough that browser success is not final truth. Simply Connect's own documentation recommends DMNs for async APMs, which matches this project's reconciliation-first architecture.

Non-negotiable gate: no production claim until Nuvei sandbox evidence proves BLIK callback, `/getPaymentStatus`, and DMN fields for this exact Connect deployment.

Parallel Web SDK BLIK planning now lives in `docs/WEB_SDK_BLIK_IMPLEMENTATION_PLAN.md`. That plan is intentionally separate: it keeps this document's Simply Connect-first decision intact while defining a parallel Web Component workstream.

## Official source facts

### BLIK

Sources:

- Nuvei BLIK guide: <https://docs.nuvei.com/documentation/europe-guides/blik/>
- Nuvei APM testing guide: <https://docs.nuvei.com/documentation/integration/testing/testing-apms/>

Observed from Nuvei docs:

- BLIK is a Polish mobile payment method.
- Supported country: Poland.
- Supported currency: PLN.
- Nuvei lists BLIK payments and refunds as supported; payouts and recurring are not supported.
- BLIK UX requirements include:
  - method name `BLIK`;
  - one input field named code;
  - only 6 digits allowed;
  - display as `[3 digits][space][3 digits]`;
  - numeric keyboard on mobile;
  - after deposit initiation, show “Confirm the payment in your bank’s app.”
- REST API 1.0 BLIK payment uses `paymentOption.alternativePaymentMethod.paymentMethod: "apmgw_BLIK"` and `blik_code`.
- REST API 1.0 BLIK payment requires shopper/user material including first name, last name, country, email, and customer IP in `deviceDetails.ipAddress`.
- Nuvei's sample BLIK `/payment` response returns `transactionStatus: "PENDING"`; final result arrives by DMN.
- Nuvei's sample BLIK DMN includes `payment_method=apmgw_BLIK`, `transactionType=Sale`, amount, currency, PPP transaction identity, fiscal transaction identity, and `Status=APPROVED` for approved payment.
- Test BLIK codes: any six-digit code starting with `777` succeeds; a code not starting with `777` declines.

### Simply Connect

Sources:

- Quick Start to Simply Connect: <https://docs.nuvei.com/documentation/accept-payment/simply-connect/quick-start-for-checkout/>
- Simply Connect payment customization: <https://docs.nuvei.com/documentation/accept-payment/simply-connect/payment-customization/>

Observed from Nuvei docs:

- Backend must call `/openOrder` and return `sessionToken` to the browser. Secret-key checksum generation stays backend-only.
- Browser loads `https://cdn.safecharge.com/safecharge_resources/v1/checkout/checkout.js` and calls `checkout({ sessionToken, env, merchantId, merchantSiteId, amount, currency, country, renderTo, onResult, ... })`.
- Browser `onResult` is not authoritative. The merchant server must verify the result with `/getPaymentStatus` or DMN.
- DMNs are recommended, especially for async APM transactions.
- `/getPaymentStatus` is only for the end of payment processing; it is not intended for repeated polling.
- `pmWhitelist` restricts displayed payment methods. Example values use Nuvei method codes such as `cc_card` and `apmgw_<paymentMethod>`.
- Simply Connect can collect missing APM fields on the payment page, but this project should still prefer server-side validation where Checkout/cart data is required for reconciliation.

### Web SDK APMs

Source:

- APM Payments with Web SDK: <https://docs.nuvei.com/documentation/accept-payment/web-sdk/apm-payments/>

Observed from Nuvei docs:

- Backend still starts with `/openOrder` and returns `sessionToken`.
- Browser instantiates `SafeCharge({ env, merchantId, merchantSiteId })`.
- Browser can call `sfc.getApms({ currencyCode, countryCode, languageCode })` to fetch APMs.
- Browser creates an APM payment with `sfc.createPayment({ sessionToken, paymentOption: { alternativePaymentMethod: { paymentMethod: "apmgw_..." } }, billingAddress, ... })`.
- Redirect-based APMs can return `redirectUrl`, which the merchant must handle.
- Response verification still routes to server verification/DMN.

## Current repository state

### Browser enabler

Relevant files:

- `enabler/src/payment-enabler/method-registry.ts`
- `enabler/src/payment-enabler/checkout-enabler.ts`
- `enabler/src/components/simply-connect-dropin.ts`
- `enabler/src/components/web-sdk-card.ts`
- `enabler/src/services/simply-connect-sdk.ts`
- `enabler/src/services/web-sdk.ts`
- `enabler/src/services/api-service.ts`

Observed state:

- Public Checkout adapter `Enabler` supports:
  - `createComponentBuilder("card")` -> `WebSdkCardBuilder`;
  - `createDropinBuilder("embedded")` -> `SimplyConnectDropinBuilder`;
  - express and stored methods reject safely.
- The shared registry contains only `card` and `embedded`.
- `SimplyConnectDropinComponent` currently calls `POST /payments/session` with `{ paymentMethodOptions: { embedded: {} } }`.
- `SimplyConnectDropinComponent` hardcodes `pmWhitelist: ["cc_card"]`. This is the single line that intentionally hides APMs today.
- `SimplyConnectDropinComponent` already passes `prePayment`, `onPaymentEvent`, `onResult`, and `onError` into `checkout(...)`.
- `SimplyConnectDropinComponent` currently uses `baseOptions.countryCode ?? "US"`; this fallback is unsafe for BLIK because BLIK is Poland/PLN only and Simply Connect filters APMs by country/currency.
- `WebSdkCardComponent` only creates a Nuvei card field via `sfc.fields({}).create("card", {})` and submits `paymentOption: this.scard`.
- `SafeChargeInstance.createPayment` typing only accepts `paymentOption: SafeChargeCardField`; it does not type alternative payment method objects.
- `confirmPaymentResult()` retries pending confirmations by default when `onPending` is absent. Nuvei docs warn `/getPaymentStatus` must not be used for repeated polling, so BLIK needs explicit pending behavior instead of relying on browser polling.

### Processor

Relevant files:

- `processor/src/dtos/operations/payment-components.dto.ts`
- `processor/src/dtos/nuvei-payment.dto.ts`
- `processor/src/services/nuvei-payment.service.ts`
- `processor/src/services/ct-payment-creation.service.ts`
- `processor/src/services/converters/nuvei-event.converter.ts`
- `processor/src/services/payment-converter.ts`
- `processor/src/clients/nuvei.client.ts`
- `processor/src/routes/nuvei-payment.route.ts`

Observed state:

- `GET /operations/payment-components` advertises `dropins: [{ type: "embedded" }]`, `components: [{ type: "card" }]`, `express: []`.
- `validatePaymentMethodOptions()` accepts exactly one key under `paymentMethodOptions`; today `card` and `embedded` must both carry empty object payloads.
- `createPaymentSession()` freezes the cart, gets the planned amount, calls Nuvei `/openOrder`, creates a CT Payment, and returns `cartId`, `sessionToken`, `paymentReference`, `merchantReturnUrl`, `amount`, and `currency`.
- `/openOrder` already gets `clientUniqueId: cart.id`, optional `urlDetails.notificationUrl`, and safe shopper details from cart billing/shipping address.
- CT Payment creation stores the Nuvei session token as `Payment.interfaceId` and adds an Initial `Authorization` transaction for every current method.
- `PAYMENT_METHOD_INFO_METHODS` maps both `card` and `embedded` to CT `paymentMethodInfo.method: "card"`.
- `confirmPayment()` always writes a terminal `Authorization`, even if Nuvei reports a sale-style method. BLIK should write `Charge` when Nuvei reports `transactionType=Sale`.
- DMN conversion maps `cardCompany`/`cardType` into CT payment method metadata. It does not yet map APM fields such as `payment_method=apmgw_BLIK`.
- Payment capture/cancel/refund operations currently assume card authorization semantics unless guarded by transaction availability and Nuvei responses.

## Path A: Web SDK BLIK

### Flow

1. Checkout asks the enabler for a new BLIK component, for example `createComponentBuilder("blik")`.
2. The BLIK component mounts connector-owned UI:
   - BLIK logo/name;
   - six-digit input;
   - `[3 digits][space][3 digits]` formatting;
   - mobile numeric keyboard;
   - “Confirm the payment in your bank’s app.” state after submit.
3. The component calls `POST /payments/session` with BLIK intent.
4. Processor freezes the cart, validates PL/PLN and shopper details, opens a Nuvei order, creates CT Payment metadata for BLIK, and returns the session.
5. On host submit, the component calls `sfc.createPayment(...)` with:
   - `sessionToken`;
   - CT Payment reference in Nuvei merchant reference aliases where supported;
   - `paymentOption.alternativePaymentMethod.paymentMethod: "apmgw_BLIK"`;
   - `paymentOption.alternativePaymentMethod.blik_code: <six digit code>`;
   - shopper billing/user details required by Nuvei.
6. Component handles immediate error/cancel/pending/approved result, then calls processor confirmation.
7. Processor verifies status and DMN reconciles final state.

### Required implementation

Browser:

- Add `PaymentMethod.blik` as a component method only if this path is chosen.
- Add `WebSdkBlikBuilder` and `WebSdkBlikComponent`.
- Add custom BLIK UI and validation matching Nuvei UX requirements.
- Extend `SafeChargeInstance.createPayment` types to accept `paymentOption.alternativePaymentMethod`.
- Decide and implement redirect handling if Nuvei returns `redirectUrl` in any BLIK variant.
- Ensure BLIK code is never logged, stored, or forwarded to the processor.
- Add pending-state UX that does not poll `/getPaymentStatus` repeatedly.

Processor:

- Add BLIK session intent validation.
- Enforce PLN and Polish shopper/billing country before calling Nuvei.
- Ensure required first name, last name, country, email, and IP/device requirements are either sent through Web SDK or explicitly unavailable with sandbox evidence.
- Create CT Payment as BLIK with `Charge Initial`, not card `Authorization Initial`.
- Map confirm/DMN transaction type to CT `Charge` for sale-style BLIK payments.
- Block capture/cancel authorization operations for BLIK; allow refund after a successful charge.

Tests:

- Browser UI validation for six digits, formatting, numeric input hints, and no code logging.
- Web SDK APM payload shape.
- Confirmation pending/approved/declined paths.
- DMN BLIK mapping and idempotency.
- Operation guards.

### Pros

- Checkout can expose BLIK as a distinct Web Component type if commercetools supports the new component method key.
- Connector has full control over BLIK UI and pending messaging.
- It avoids changing the existing Simply Connect drop-in behavior.

### Cons

- Most custom code.
- Highest chance of UX drift from Nuvei's method requirements.
- Requires direct handling of BLIK code, direct APM payload shape, possible redirect behavior, and field collection.
- Current `WebSdkCardComponent` is card-specific; this is a new implementation, not an extension.
- More reconciliation risk because this path may produce different callback/DMN fields than the existing Simply Connect drop-in.

### When to choose later

Choose Web SDK BLIK only if a product requirement demands BLIK as a distinct Checkout Web Component tile with host-owned submit and a merchant-owned BLIK form. That is not the easiest reliable first path in this project.

## Path B: Simply Connect BLIK

### Flow

1. Merchant configures a commercetools Checkout Drop-in payment integration for this connector's existing `embedded` type and names it “BLIK” or “Nuvei BLIK”.
2. Checkout calls `new Enabler({ processorUrl, sessionId, locale, countryCode, onComplete, onError, onPending })`.
3. Checkout calls `createDropinBuilder("embedded")` and mounts the drop-in.
4. Enabler fetches safe Nuvei frontend config from `GET /operations/config`.
5. Enabler calls `POST /payments/session` with BLIK intent.
6. Processor:
   - authenticates the commercetools session;
   - fetches and freezes the cart;
   - validates BLIK prerequisites from the cart/session;
   - calls Nuvei `/openOrder` with amount, PLN currency, cart ID, notification URL, and available shopper details;
   - creates a CT Payment with BLIK metadata and a `Charge Initial` transaction;
   - returns session data.
7. Enabler calls `checkout(...)` with:
   - `pmWhitelist: ["apmgw_BLIK"]`;
   - `amount`/`currency` from the processor;
   - country from the processor/session, not the current `US` fallback;
   - `savePM: "false"` or BLIK-specific `apmConfig.apmgw_BLIK.savePM: "false"` for the first implementation;
   - existing `prePayment`, `onPaymentEvent`, `onResult`, and `onError` callbacks.
8. Nuvei renders the BLIK method and owns BLIK code entry.
9. Browser `onResult` triggers one server confirmation. If confirmation is pending, the UI shows pending and waits for DMN instead of polling repeatedly.
10. Nuvei DMN reconciles the final CT Payment transaction exactly once.

### Required implementation

Browser:

- Replace the card-only whitelist constant with a typed Simply Connect method map:

  ```ts
  const SIMPLY_CONNECT_METHODS = {
    card: { pmWhitelist: ["cc_card"] as const },
    blik: { pmWhitelist: ["apmgw_BLIK"] as const },
  } as const;
  ```

- Add a safe frontend config field from `GET /operations/config`, for example:

  ```ts
  type ProcessorConfigResponse = {
    environment: string;
    merchantId: string;
    merchantSiteId: string;
    simplyConnectPaymentMethod: "card" | "blik";
  };
  ```

- Default `simplyConnectPaymentMethod` to `card` so current behavior does not change accidentally.
- For BLIK deployments, set the config to `blik`; the enabler then uses `pmWhitelist: ["apmgw_BLIK"]`.
- Pass BLIK intent to session creation:

  ```ts
  api.createPayment({
    paymentMethodOptions: {
      embedded: { paymentMethod: "blik" },
    },
  });
  ```

- Keep the public Checkout builder type as `embedded`. Do not advertise a fake drop-in type like `blik` unless commercetools Checkout officially supports method-specific drop-in types.
- Stop using `countryCode ?? "US"` for BLIK. Use a processor/cart-derived country and fail setup if BLIK cannot be shown for PL/PLN.
- Extend `CheckoutConfig` typing for any BLIK options used by checkout.js, such as `savePM` and `apmConfig`.
- For BLIK, set stored-payment behavior off in the first version:

  ```ts
  checkout({
    pmWhitelist: ["apmgw_BLIK"],
    savePM: "false",
    apmConfig: {
      apmgw_BLIK: { savePM: "false" },
    },
  });
  ```

- Keep `prePayment` as the terms/order validation gate before Nuvei starts payment.
- Do not inspect or forward Nuvei's BLIK payload. Treat browser result objects as unsafe diagnostics.
- Update `confirmPaymentResult()` usage so BLIK does not repeatedly poll `/getPaymentStatus` when pending. Preferred behavior:
  - call confirmation once after `onResult`;
  - if pending, call `onPending({ paymentReference })`;
  - rely on DMN for final state;
  - if Checkout cannot consume `onPending`, display a documented recoverable pending state rather than reporting a false terminal success.

Processor:

- Split the current single “payment method” concept into two internal concepts:

  ```ts
  type CheckoutUiMethod = "card" | "embedded";
  type NuveiTender = "card" | "blik";
  ```

- Keep `/operations/payment-components` unchanged for Checkout compatibility:

  ```json
  {
    "dropins": [{ "type": "embedded" }],
    "components": [{ "type": "card" }],
    "express": []
  }
  ```

- Update `PaymentMethodOptionsSchema` and `validatePaymentMethodOptions()`:
  - `{ paymentMethodOptions: { card: {} } }` -> `uiMethod=card`, `tender=card`;
  - `{ paymentMethodOptions: { embedded: {} } }` -> current/default `uiMethod=embedded`, `tender=card` for backward compatibility;
  - `{ paymentMethodOptions: { embedded: { paymentMethod: "blik" } } }` -> `uiMethod=embedded`, `tender=blik`;
  - reject arbitrary objects, multiple keys, unsupported values, arrays, and raw Nuvei method codes from the browser.
- Add processor config such as `NUVEI_SIMPLY_CONNECT_PAYMENT_METHOD=card|blik`. The processor must reject a browser BLIK intent unless this deployment config allows BLIK.
- Validate BLIK setup before `/openOrder`:
  - cart currency must be `PLN`;
  - billing or shipping country must be `PL`;
  - required shopper identity fields must be present from cart/session, or the plan must be explicitly changed after sandbox proof that Simply Connect reliably collects missing fields for BLIK;
  - never synthesize fake shopper details.
- Keep Nuvei secret-key checksum and `/openOrder` backend-only.
- For BLIK `/openOrder`, keep:
  - `clientUniqueId: cart.id`;
  - `urlDetails.notificationUrl` when `CONNECT_SERVICE_URL` is configured;
  - `billingAddress` and `userDetails` from cart shopper details.
- Extend `PaymentSessionResponseSchema` with safe method/country fields needed by the enabler, for example:

  ```ts
  {
    cartId: string;
    sessionToken: string;
    paymentReference: string;
    merchantReturnUrl: string;
    amount: string;
    currency: string;
    paymentMethod: "card" | "blik";
    countryCode?: string;
  }
  ```

- Update CT Payment creation to accept `NuveiTender` and initial transaction type:
  - card/Web SDK -> `Authorization Initial`, `paymentMethodInfo.method: "card"`, name `Nuvei card`;
  - embedded card compatibility -> existing behavior;
  - BLIK -> `Charge Initial`, `paymentMethodInfo.method: "blik"`, name `BLIK` or `Nuvei BLIK`.
- Update `confirmPayment()` so terminal transaction type is derived from Nuvei status `transactionType` using the existing `mapNuveiTransactionType()` helper when present. Do not hard-code `Authorization` for BLIK.
- If BLIK confirmation is approved but lacks a stable transaction identity, prefer returning `pending` and waiting for DMN over writing an uncorrelatable terminal transaction.
- Update DMN converter:
  - keep card `cardCompany`/`cardType` behavior;
  - when `payment_method` or equivalent field is `apmgw_BLIK`, set `paymentMethodInfo.method: "blik"` and `paymentMethodInfo.name: { en: "BLIK" }`;
  - map `transactionType=Sale` to CT `Charge` through existing converter behavior;
  - preserve amount/currency and PPP identity checks.
- Operation support:
  - Capture authorization: reject BLIK; there is no authorization to capture.
  - Cancel authorization / void: reject BLIK unless sandbox proves Nuvei supports void before final settlement and CT semantics are defined.
  - Refund: allow only after a successful `Charge`; use the BLIK charge interaction ID as `relatedTransactionId`.
- Logging/security:
  - never log BLIK code;
  - never log raw checkout result or raw DMN body;
  - keep existing token redaction and safe DMN log fields.

Tests:

- Enabler unit tests:
  - BLIK config selects `pmWhitelist: ["apmgw_BLIK"]`;
  - BLIK config sends `paymentMethodOptions.embedded.paymentMethod = "blik"`;
  - card default still uses `pmWhitelist: ["cc_card"]`;
  - BLIK does not default `country` to `US`;
  - pending BLIK result calls `onPending` without repeated polling.
- Processor unit tests:
  - payment method validation accepts only the typed BLIK payload;
  - BLIK is rejected unless config enables it;
  - BLIK rejects non-PLN currency and non-PL country;
  - BLIK CT Payment uses `Charge Initial` and method/name BLIK;
  - `confirmPayment()` writes `Charge Success` for Nuvei `transactionType=Sale`;
  - DMN `payment_method=apmgw_BLIK` updates CT payment method info;
  - duplicate confirm/DMN does not create duplicate terminal transactions;
  - capture/cancel reject BLIK and refund is allowed only after charge success.
- Contract tests:
  - `/operations/payment-components` stays `{ dropins: [{ type: "embedded" }], components: [{ type: "card" }], express: [] }`.
- Example harness:
  - add a BLIK mode using the same Checkout-facing drop-in path;
  - add mock DMN payload with `payment_method=apmgw_BLIK` and `transactionType=Sale`;
  - document `777xxx` success and non-`777xxx` decline codes.

### Pros

- Smallest browser implementation: no custom BLIK form.
- Reuses the existing Connect drop-in contract and current Simply Connect loader.
- Nuvei owns BLIK UX and APM field behavior.
- Fits current reconciliation architecture: server confirmation plus DMN finality.
- Easy rollback: set the BLIK config back to card/default and the drop-in returns to current card-only behavior.

### Cons

- BLIK appears through the existing `embedded` drop-in surface, not as a new Web Component method type.
- Requires care to separate Checkout UI surface (`embedded`) from actual Nuvei tender (`blik`) in processor metadata.
- Hosted Checkout pending behavior must be proven; BLIK can be pending while the shopper confirms in the banking app.

## Comparison

| Criterion | Web SDK BLIK | Simply Connect BLIK | Winner |
| --- | --- | --- | --- |
| Browser code | New BLIK UI, validation, createPayment APM payload, pending/redirect handling | Reuse existing drop-in, change whitelist/mode | Simply Connect |
| BLIK UX compliance | Connector must implement six-digit formatting, mobile keyboard, logo/message | Nuvei-owned UI should satisfy method UX | Simply Connect |
| Current project fit | Current Web SDK component is card-only | Current Simply Connect drop-in already exists | Simply Connect |
| Reconciliation fit | Must prove new Web SDK APM callback/DMN shape | Reuses current drop-in confirmation/DMN shape with BLIK-specific mapping | Simply Connect |
| Checkout compatibility | Can be distinct component only if Checkout accepts `blik` type | Uses existing `embedded` DropIn type | Simply Connect |
| Async APM handling | Connector owns more behavior | Nuvei docs recommend DMN for Simply Connect async APMs | Simply Connect |
| Operation semantics | Same processor changes still needed | Same processor changes still needed | Tie |
| Sandbox burden | Higher: custom UI + APM payload + callbacks | Lower: Nuvei widget + BLIK whitelist + callbacks | Simply Connect |
| Long-term flexibility | More custom control | Better first path; Web SDK can remain future option | Simply Connect for first cut |

Final decision: **implement BLIK through Simply Connect first**.

## Implementation sequence

### Phase 1 — Make Simply Connect method mode explicit

Goal: select card or BLIK for the existing `embedded` drop-in without advertising unsupported methods.

Files:

- `processor/src/config/config.ts`
- `processor/src/dtos/operations/config.dto.ts`
- `processor/src/dtos/nuvei-payment.dto.ts`
- `processor/src/services/nuvei-payment.service.ts`
- `enabler/src/services/api-service.ts`
- `enabler/src/components/simply-connect-dropin.ts`
- `enabler/src/services/simply-connect-sdk.ts`

Changes:

1. Add config `NUVEI_SIMPLY_CONNECT_PAYMENT_METHOD=card|blik`, default `card`.
2. Return the safe value from `/operations/config`.
3. Update enabler config typing.
4. Replace the hardcoded `SIMPLY_CONNECT_CARD_WHITELIST` with typed method config.
5. In BLIK mode, call session creation with `{ embedded: { paymentMethod: "blik" } }`.
6. In BLIK mode, call `checkout()` with `pmWhitelist: ["apmgw_BLIK"]` and stored-payment disabled.
7. Preserve the current card-only drop-in behavior when config is absent/default.

Acceptance:

- Existing card drop-in tests still pass in default config.
- New BLIK enabler test proves the whitelist and session body.

### Phase 2 — Validate BLIK session prerequisites server-side

Goal: fail unsupported BLIK carts before Nuvei state or CT Payment state is created.

Files:

- `processor/src/dtos/nuvei-payment.dto.ts`
- `processor/src/services/nuvei-payment.service.ts`
- `processor/src/services/ct-payment-creation.service.ts`
- `processor/test/unit/services/nuvei-payment.service.test.ts`

Changes:

1. Change `validatePaymentMethodOptions()` to return a structured selection instead of one string.
2. Reject BLIK unless deployment config enables BLIK.
3. Reject BLIK when currency is not PLN.
4. Reject BLIK when cart billing/shipping country is not PL.
5. Require shopper first name, last name, country, and email for first implementation unless sandbox evidence proves Simply Connect collection is sufficient.
6. Call `/openOrder` only after those checks pass.
7. Return safe `paymentMethod` and `countryCode` in `PaymentSessionResponse`.

Acceptance:

- Unsupported BLIK requests return public setup errors and do not call Nuvei or create CT Payments.
- No raw shopper PII is logged in validation failures.

### Phase 3 — Store correct CT payment semantics

Goal: BLIK is not represented as card authorization.

Files:

- `processor/src/services/ct-payment-creation.service.ts`
- `processor/src/dtos/operations/payment-components.dto.ts`
- `processor/test/unit/services/ct-payment-creation.service.test.ts`

Changes:

1. Add a tender/method metadata map separate from the Checkout UI registry.
2. For BLIK, create CT Payment with:
   - `paymentMethodInfo.method: "blik"`;
   - `paymentMethodInfo.name.en: "BLIK"` or `"Nuvei BLIK"`;
   - `Charge Initial` transaction;
   - Nuvei session token as `interfaceId`.
3. Keep card Web SDK and card drop-in compatibility unchanged.

Acceptance:

- BLIK Payment in tests has no Initial `Authorization`.
- Existing card tests still assert `Authorization Initial`.

### Phase 4 — Reconcile BLIK status and DMNs

Goal: confirmation and DMN both converge to one CT terminal transaction.

Files:

- `processor/src/services/nuvei-payment.service.ts`
- `processor/src/services/converters/nuvei-event.converter.ts`
- `processor/src/services/payment-converter.ts`
- `processor/test/unit/services/nuvei-payment.service.test.ts`
- `processor/test/unit/services/dmn-processing.service.test.ts`
- `processor/test/unit/services/nuvei-event.converter.test.ts`

Changes:

1. In `confirmPayment()`, derive terminal transaction type from Nuvei `transactionType` when present.
2. Map BLIK `Sale` to CT `Charge`.
3. Return pending instead of writing an ambiguous terminal transaction when BLIK status lacks enough identity.
4. In DMN converter, map `payment_method=apmgw_BLIK` to BLIK method info.
5. Ensure duplicate detection covers confirm-first and DMN-first orderings.
6. Add BLIK DMN fixtures for approved, declined, pending, duplicate, and amount/currency mismatch.

Acceptance:

- BLIK success writes exactly one successful `Charge`.
- BLIK decline writes one failed terminal transaction or a safe rejected outcome, according to observed Nuvei fields.
- Duplicate DMNs do not add duplicate terminal transactions.
- Amount/currency mismatch fails loudly and does not update CT Payment.

### Phase 5 — Guard unsupported operations

Goal: card operations do not accidentally run against BLIK.

Files:

- `processor/src/services/nuvei-payment.service.ts`
- `processor/test/unit/services/nuvei-payment.service.test.ts`
- `docs/TEST_SCENARIOS.md` after implementation

Changes:

1. Add method detection helper from CT `paymentMethodInfo.method` and/or terminal transactions.
2. Reject capture for BLIK.
3. Reject cancel authorization for BLIK unless sandbox proves a valid pre-settlement void flow and the CT state model is updated.
4. Allow refund only after successful `Charge` and use the charge interaction ID.

Acceptance:

- Capture/cancel requests for BLIK do not call Nuvei.
- Refund request for a successfully charged BLIK payment calls Nuvei with the charge interaction ID.

### Phase 6 — Example harness and manual evidence

Goal: prove behavior with local mock first, then Nuvei sandbox.

Files:

- `examples/nuvei-web-ui/index.html`
- `examples/nuvei-web-ui/mock-commercetools-server.mjs`
- `examples/nuvei-web-ui/api-e2e-test.mjs`
- `examples/nuvei-web-ui/README.md`
- `docs/TEST_SCENARIOS.md`
- `docs/TESTING.md`

Changes:

1. Add BLIK mode to the local example harness.
2. Mock BLIK session validation and BLIK DMN payloads.
3. Add test instructions for `777xxx` success and non-`777xxx` decline.
4. Add a sanitized evidence checklist.

Manual sandbox scenarios:

1. Merchant account has BLIK enabled by Nuvei.
2. Cart currency PLN, billing/shipping country PL.
3. Complete Checkout BLIK success with `777xxx` code.
4. Payment Only BLIK success with `777xxx` code.
5. Decline with non-`777xxx` code.
6. Shopper abandons before bank-app confirmation.
7. DMN arrives before browser confirmation.
8. Browser confirmation arrives before DMN.
9. Duplicate DMN.
10. Refund after BLIK charge.
11. Capture and cancel authorization are rejected safely.
12. No logs contain BLIK code, session token, checksum, PAN, or raw Nuvei callback payloads.

Acceptance:

- BLIK is not advertised or rendered until config enables it.
- Successful BLIK payment reconciles to exactly one CT Payment.
- CT terminal transaction type is `Charge`, not `Authorization`.
- Final state is driven by server verification/DMN, not browser result alone.

### Phase 7 — Documentation update after code lands

Files to update after implementation:

- `README.md`
- `docs/CONFIGURATION.md`
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
- `docs/TEST_SCENARIOS.md`
- `docs/DEPLOYMENT.md`
- `docs/ROADMAP.md` if BLIK becomes an active milestone item

Required doc updates:

- New config key and default.
- BLIK prerequisites: Nuvei account enablement, Poland, PLN, test codes.
- Checkout Merchant Center setup: use Drop-in `embedded`, name it BLIK/Nuvei BLIK.
- Operation support matrix: payment and refund only for first implementation; capture/cancel unsupported.
- Evidence/runbook steps.

## Files expected to change in implementation

Enabler:

- `enabler/src/payment-enabler/method-registry.ts` only if display metadata needs a BLIK-aware entry; avoid public method churn if `embedded` remains the Checkout type.
- `enabler/src/payment-enabler/checkout-enabler.ts`
- `enabler/src/components/simply-connect-dropin.ts`
- `enabler/src/services/simply-connect-sdk.ts`
- `enabler/src/services/api-service.ts`
- `enabler/test/unit/simply-connect-dropin.test.ts`
- `enabler/test/unit/checkout-enabler.test.ts`
- `enabler/test/unit/api-service.test.ts`

Processor:

- `processor/src/config/config.ts`
- `processor/src/dtos/operations/config.dto.ts`
- `processor/src/dtos/nuvei-payment.dto.ts`
- `processor/src/dtos/operations/payment-components.dto.ts` only if internal type exports are reorganized; public response should stay unchanged.
- `processor/src/services/nuvei-payment.service.ts`
- `processor/src/services/ct-payment-creation.service.ts`
- `processor/src/services/converters/nuvei-event.converter.ts`
- `processor/src/services/payment-converter.ts` if new Nuvei transaction values appear in sandbox.
- `processor/test/unit/**` relevant route/service/converter/contract tests.

Examples/docs:

- `examples/nuvei-web-ui/**`
- `docs/CONFIGURATION.md`
- `docs/TEST_SCENARIOS.md`
- `docs/TESTING.md`
- `docs/ARCHITECTURE.md`

## Non-goals for first BLIK implementation

- BLIK One-click.
- BLIK Pay Later.
- Stored payment methods/UPO reuse.
- Web SDK BLIK component.
- Mixed card+BLIK Simply Connect gallery in the same first cut.
- Production deployment.
- Any browser-side final-truth decision.

## Open questions to answer with sandbox evidence

These are not design blockers for choosing Simply Connect, but they block production readiness:

1. Does Simply Connect BLIK `onResult` fire only after bank-app approval/decline, or can it fire while Nuvei status is still pending?
2. Which fields does `/getPaymentStatus` return for Simply Connect BLIK: `transactionType`, `PPP_TransactionID`, `TransactionID`, `payment_method`, `clientUniqueId`, `merchant_unique_id`, `sessionToken`?
3. Does BLIK DMN include `sessionToken` or only `sessionId`/`merchant_unique_id`/`clientUniqueId`?
4. Does Nuvei echo the CT Payment reference if the connector sends merchant reference aliases through Simply Connect, or is session-token/cart fallback still required?
5. Can Simply Connect reliably collect missing email/name for BLIK, or must the processor require those fields before `/openOrder`?
6. Does Nuvei support void/cancel before a BLIK payment finalizes, or should all BLIK cancellation be treated as shopper abandonment/pending timeout?
7. What exact refund API fields does Nuvei require for a settled BLIK charge in this merchant account?

## Recommended first implementation cut

Build **BLIK-only Simply Connect mode** behind an explicit processor config flag:

```text
NUVEI_SIMPLY_CONNECT_PAYMENT_METHOD=blik
```

Current public Checkout surface includes Web SDK BLIK by default and keeps Simply Connect BLIK as an optional drop-in mode:

```json
{
  "dropins": [{ "type": "embedded" }],
  "components": [{ "type": "card" }, { "type": "blik" }],
  "express": []
}
```

Use Web SDK for cards and BLIK, or configure Simply Connect BLIK only when the merchant wants Nuvei-owned BLIK UI inside the `embedded` drop-in. Do not mix Web SDK BLIK and Simply Connect BLIK inside the same Checkout application unless the merchant deliberately wants two BLIK entries.

Minimum done criteria:

- Web SDK BLIK is advertised by default; Simply Connect BLIK remains opt-in through `NUVEI_SIMPLY_CONNECT_PAYMENT_METHOD=blik`.
- Simply Connect card mode remains the default drop-in behavior.
- BLIK renders through Simply Connect with `pmWhitelist: ["apmgw_BLIK"]`.
- Processor rejects non-PLN/non-PL BLIK carts before Nuvei state is created.
- CT Payment records BLIK as `Charge`, not card `Authorization`.
- DMN maps `payment_method=apmgw_BLIK` to BLIK metadata.
- Capture/cancel are blocked; refund is supported after charge success.
- Sandbox evidence covers success, decline, pending/abandonment, duplicate DMN, and refund.
