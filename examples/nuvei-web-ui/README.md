# Nuvei Web UI Example

## Overview
Local integration example and evidence harness for the Nuvei commercetools connector. Supports Simply Connect and Web SDK card modes.

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

## Mock CT server
The mock server simulates commercetools cart and payment APIs for local evidence capture.
It provides `/session`, `/carts`, and `/payments`-related endpoints used by the example harness.

## Modes
This example supports two Nuvei card modes: Simply Connect (index.html mode selector) and Web SDK (same). See `index.html` after running `npm start`.

## Phase 2 evidence
Use this package as the entry point for Nuvei sandbox evidence capture.

This replaces the `testing/` directory from Phase 1.1.
