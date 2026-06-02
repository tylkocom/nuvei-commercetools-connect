# Local Testing Harness

This directory contains tools for testing the Nuvei connector without deploying to commercetools Connect.

## Files

| File | Purpose |
|------|---------|
| `mock-commercetools-server.mjs` | Express server that impersonates commercetools Checkout and the Nuvei processor for browser testing |
| `nuvei-real-processor-test.html` | Browser test page for the Simply Connect widget |
| `api-e2e-test.mjs` | Headless Node.js test for processor endpoints (no browser needed) |
| `start-dmn-tunnel.mjs` | Creates a public tunnel so Nuvei sandbox can send real DMNs to your local processor |

## Quick Start

### 1. Start the mock commercetools server

```bash
npm run start --prefix testing
# or
cd testing && npm start
```

This runs on port 8089 by default.

### 2. Start the processor

```bash
npm run start --prefix processor
```

This runs on port 8080 by default.

### 3. Serve the browser test page

```bash
npx serve . -l 3000 --cors
```

Then open: `http://localhost:3000/testing/nuvei-real-processor-test.html`

### 4. Run headless API tests

```bash
npm run test:api --prefix testing
```

Tests:
- Processor health check
- CORS preflight
- Auth rejection for unauthenticated requests
- Mock CT session creation
- Mock CT payment confirmation
- DMN webhook endpoint (processor rejects synthetic checksum as expected)
- Debug dump endpoint

### 5. Receive real Nuvei DMNs (optional)

To test with the real Nuvei sandbox and receive actual DMNs:

```bash
# Install localtunnel (free, no account needed)
npm install --prefix testing localtunnel

# Start tunnel
npm run tunnel:dmn --prefix testing
```

Copy the printed HTTPS URL into the Nuvei dashboard:
**Settings > My Integration Settings > DMN URL**

## Environment Variables

Create a `testing/.env` file (optional):

```bash
NUVEI_MERCHANT_ID=your_merchant_id
NUVEI_MERCHANT_SITE_ID=your_site_id
NUVEI_SECRET_KEY=your_secret_key
```

When these are present, the mock server calls the real Nuvei sandbox `openOrder.do` instead of returning mock tokens.

## Architecture

```
Browser (localhost:3000)
  → Enabler (connector-enabler.es.js)
    → Mock CT Server (localhost:8089)
      → Real Nuvei Sandbox (optional, with creds)
    → Processor (localhost:8080)
      → Real commercetools project
      → Real Nuvei sandbox APIs
```

The mock server intercepts commercetools API calls that the processor makes (cart, payment lookups) and returns local mock data. This lets you test the processor against a controlled dataset while still using real Nuvei sandbox credentials for payment execution.
