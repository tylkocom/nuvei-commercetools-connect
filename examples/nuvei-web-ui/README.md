# Nuvei Web UI Example

## Overview
Local integration example and evidence harness for the Nuvei commercetools connector. Supports the Checkout-facing Enabler drop-in path, the Enabler card component path, and Web SDK BLIK local mode.

## Prerequisites
- Node.js 18+
- npm
- A running connector processor (see `processor/` README)

## Quick start
```bash
npm install
npm start        # starts mock CT server on port 8089
# then open index.html (added in Phase 1.2 Plan 04) in browser, pointed at processor
```

## Scripts
- `npm start` — Start mock commercetools server (Express, port 8089)
- `npm run test:api` — Run API end-to-end tests against running processor
- `npm run tunnel:dmn` — Expose `/webhooks/nuvei` to Nuvei sandbox via localtunnel/ngrok
- `npm run mock:ct:self-check` — Run the mock CT/server contract self-check, including Web SDK BLIK assertions.

## Mock CT server
The mock server simulates commercetools cart and payment APIs for local evidence capture.
It provides `/session`, `/carts`, and `/payments`-related endpoints used by the example harness.

## Modes
This example supports three browser modes in `index.html`:

- `Enabler drop-in` — Merchant Center/Checkout-compatible path using `new Enabler(...).createDropinBuilder("embedded")`; default mode.
- `Web SDK card` — `new Enabler(...).createComponentBuilder("card")` comparison mode with the host Pay button.
- `Web SDK BLIK` — `new Enabler(...).createComponentBuilder("blik")` local/custom-storefront mode with the host Pay button.

The mock `/payment-components` response advertises `dropins: [{ type: "embedded" }]`, `components: [{ type: "card" }, { type: "blik" }]`, and `express: []`. The mock cart currency is PLN for BLIK prerequisite testing. The drop-in session body is `{ paymentMethodOptions: { embedded: {} } }`; Web SDK card mode uses `{ paymentMethodOptions: { card: {} } }`; Web SDK BLIK mode uses `{ paymentMethodOptions: { blik: {} } }`. The BLIK code stays browser-to-Nuvei and is never sent to the mock processor.

The mock server mirrors BLIK payment semantics only for local development: BLIK creates `Charge` transactions with `paymentMethodInfo.method: "blik"` / `name.en: "BLIK"`, accepts BLIK DMNs with `payment_method=apmgw_BLIK` and `transactionType=Sale`, and treats `Status=APPROVED` as paid. This is not production evidence or a Nuvei certification result.

## Phase 2 evidence
Use this package as the entry point for Nuvei sandbox evidence capture.

This replaces the `testing/` directory from Phase 1.1.
