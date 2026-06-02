# Nuvei Local Test With Mocked commercetools

Use this test to exercise the connector as the system under test while keeping commercetools mocked locally. The goal is to observe exactly what happens between the browser/enabler, processor, Nuvei sandbox, Nuvei DMN webhook, and a local mock commercetools payment ledger.

## Test shape

```text
Browser / commercetools Checkout equivalent
  -> enabler app in this repo
  -> processor app in this repo
  -> Nuvei sandbox
  -> processor app in this repo via DMN
  -> mocked commercetools payment/cart store
```

Do not hand-craft Nuvei API calls unless debugging. The connector should produce the normal Nuvei requests.

## Visibility points

Keep these open while testing:

```text
Browser DevTools
  - Network
  - Console

Processor logs
  - inbound processor requests
  - outbound Nuvei API requests/responses
  - mock commercetools reads/writes

Tunnel inspector
  - exact inbound Nuvei DMN headers/body

Mock CT ledger
  - cart state
  - payment state
  - transaction list

Nuvei sandbox dashboard
  - order/session
  - authorization
  - DMN delivery
```

Use fixed local mock IDs so correlation is obvious:

```text
Mock cart ID: cart-local-001
Mock payment ID: payment-local-001
Amount: 10.00
Currency: EUR
```

## Endpoint 1: `POST /payments/session`

### Normal caller

```text
enabler browser code -> processor
```

In this repo, the request is made by:

```text
enabler/src/services/api-service.ts
```

Card source:

```text
enabler/src/components/card.ts
```

Drop-in source:

```text
enabler/src/dropin/dropin-embedded.ts
```

### Local endpoint

```text
POST http://localhost:8080/payments/session
```

Card body:

```json
{
  "paymentMethodOptions": {
    "card": {}
  }
}
```

Embedded drop-in body:

```json
{
  "paymentMethodOptions": {
    "embedded": {}
  }
}
```

Header:

```text
X-Session-ID: <mock-session-id>
```

### What this tests

This tests the processor's Nuvei `openOrder` creation path.

Code under test:

```text
processor/src/routes/nuvei-payment.route.ts
processor/src/services/nuvei-payment.service.ts
processor/src/clients/nuvei.client.ts
processor/src/services/ct-payment-creation.service.ts
```

Important internal call:

```ts
nuveiClient().openOrder({
  amount,
  currency,
  clientUniqueId: cart.id,
})
```

### Normal downstream calls

```text
processor -> mock commercetools cart/payment service
processor -> Nuvei sandbox openOrder.do
processor -> mock commercetools create Payment
```

### Expected response to browser/enabler

```json
{
  "cartId": "cart-local-001",
  "sessionToken": "<nuvei-session-token>",
  "paymentReference": "payment-local-001",
  "merchantReturnUrl": "http://localhost:..."
}
```

### Logs to capture

```text
INBOUND  POST /payments/session
MOCK CT  getCart(cart-local-001)
MOCK CT  getPaymentAmount(cart-local-001)
OUTBOUND Nuvei openOrder.do request
INBOUND  Nuvei openOrder.do response
MOCK CT  create/update Payment payment-local-001
OUTBOUND response to browser with sessionToken/paymentReference
```

## Endpoint 2: Nuvei SDK payment submission

### Normal caller

```text
enabler browser code -> Nuvei browser SDK/CDN -> Nuvei sandbox
```

This is not a processor endpoint.

The enabler loads:

```text
https://cdn.safecharge.com/safecharge_resources/v1/websdk/safecharge.js
```

SDK loader source:

```text
enabler/src/services/nuvei-sdk.ts
```

Then `card.ts` / `dropin-embedded.ts` calls:

```ts
sfc.createPayment({
  sessionToken: paymentRes.sessionToken,
  merchant_unique_id: paymentRes.paymentReference,
  ...
})
```

### What this tests

This tests the enabler-to-Nuvei browser integration.

Code under test:

```text
enabler/src/components/card.ts
enabler/src/dropin/dropin-embedded.ts
enabler/src/services/nuvei-sdk.ts
enabler/src/services/api-service.ts
```

### Normal downstream calls

```text
browser -> Nuvei CDN
browser -> Nuvei SDK internals / Nuvei sandbox
Nuvei sandbox authorizes card
Nuvei SDK calls onResult(...)
```

### First approval card

```text
4000027891380961
```

Expected behavior:

```text
Nuvei widget renders
payment completes
onResult fires
```

Then the enabler proceeds to `POST /payments/confirm/:paymentId`.

### Browser visibility

Watch Browser DevTools:

```text
Network:
- connector-enabler asset
- safecharge.js
- POST /payments/session
- Nuvei SDK network calls
- POST /payments/confirm/:paymentId

Console:
- SDK load errors
- onResult payload if instrumented
```

## Endpoint 3: `POST /payments/confirm/:paymentId`

### Normal caller

```text
enabler browser code -> processor
```

Source:

```text
enabler/src/services/api-service.ts
```

### Local endpoint

```text
POST http://localhost:8080/payments/confirm/payment-local-001
```

Body:

```json
{
  "sessionToken": "<nuvei-session-token-from-/payments/session>"
}
```

Header:

```text
X-Session-ID: <mock-session-id>
```

### What this tests

This tests the processor's post-widget Nuvei status verification path.

Code under test:

```text
processor/src/routes/nuvei-payment.route.ts
processor/src/services/nuvei-payment.service.ts
processor/src/clients/nuvei.client.ts
```

Important internal call:

```ts
nuveiClient().getPaymentStatus({ sessionToken })
```

The processor classifies the Nuvei status and returns one of three outcomes:

- **Approved**: writes a CT `Authorization` transaction with `state: "Success"` and `interactionId` set to the canonical Nuvei `PPP_TransactionID`.
- **Rejected**: returns HTTP `402`. If `PPP_TransactionID` is available, writes a CT `Authorization` transaction with `state: "Failure"` and `interactionId` set to `PPP_TransactionID`. If `PPP_TransactionID` is absent, no CT transaction is written.
- **Pending**: returns HTTP `200` with `{ "outcome": "pending" }`. No CT transaction is written.

`PPP_TransactionID` is the mandatory canonical Nuvei payment-page identifier. `sessionToken` and optional fiscal `TransactionID` are never used as terminal CT transaction identity.

### Normal downstream calls

```text
processor -> mock CT getPayment(payment-local-001)
processor -> mock CT getCart(cart-local-001)
processor -> Nuvei getPaymentStatus.do
processor -> mock CT updatePayment(payment-local-001)  [approved and rejected-with-PPP only]
```

### Expected response

Approved (HTTP 200):

```json
{
  "outcome": "approved"
}
```

Rejected (HTTP 402):

```json
{
  "outcome": "rejected"
}
```

Pending (HTTP 200):

```json
{
  "outcome": "pending"
}
```

### Logs to capture

```text
INBOUND  POST /payments/confirm/payment-local-001
MOCK CT  getPayment(payment-local-001)
MOCK CT  getCart(cart-local-001)
OUTBOUND Nuvei getPaymentStatus.do request
INBOUND  Nuvei getPaymentStatus.do response
MOCK CT  updatePayment Authorization Success/Failure  [approved/rejected-with-PPP only]
OUTBOUND approved/rejected/pending response
```

## Endpoint 4: `POST /webhooks/nuvei`

### Normal caller

```text
Nuvei sandbox -> processor
```

This is the DMN webhook.

### Local endpoint

The processor endpoint is:

```text
POST http://localhost:8080/webhooks/nuvei
```

Nuvei cannot call private localhost directly, so expose it through a tunnel:

```text
https://<your-tunnel>/webhooks/nuvei
```

Set that URL in the Nuvei sandbox dashboard:

```text
Settings -> My Integration Settings -> DMN URL
```

### What this tests

This tests the processor's real Nuvei DMN handling path.

Code under test:

```text
processor/src/routes/nuvei-payment.route.ts
processor/src/services/nuvei-payment.service.ts
processor/src/clients/nuvei.client.ts
processor/src/services/converters/nuvei-event.converter.ts
processor/src/services/payment-converter.ts
```

Important checks:

```ts
validateDmnChecksum(...)
assertDmnMatchesConfig(...)
ctPaymentService.getPayment(...)
convertDmnToPaymentUpdate(...)
assertDmnUpdateMatchesPayment(...)
assertDmnMatchesNuveiStatus(...)
ctPaymentService.updatePayment(...)
```

### Normal downstream calls

```text
Nuvei -> processor /webhooks/nuvei
processor -> mock CT getPayment(payment-local-001)
processor -> Nuvei getPaymentStatus.do
processor -> mock CT updatePayment(...)
```

### Expected successful DMN effect

Mock CT payment should end with one authorization transaction, not two:

```json
{
  "id": "payment-local-001",
  "transactions": [
    {
      "type": "Authorization",
      "state": "Success",
      "interactionId": "<Nuvei PPP_TransactionID>"
    }
  ]
}
```

If frontend confirmation already added the same transaction, DMN should be idempotent. DMN deduplication uses `PPP_TransactionID` as the canonical identity key.

### Logs to capture

Tunnel inspector:

```text
Raw request headers
Raw request body
Content-Type
Exact fields Nuvei sends
```

Processor logs:

```text
INBOUND  POST /webhooks/nuvei
DMN checksum valid/invalid
DMN merchant matches config
MOCK CT getPayment(payment-local-001)
OUTBOUND Nuvei getPaymentStatus.do
MOCK CT updatePayment(...)
DMN processed successfully
```

## Endpoint 5: `GET /config`

### Normal caller

```text
commercetools Checkout / enabler setup -> processor
```

### Local endpoint

```text
GET http://localhost:8080/config
```

Header:

```text
X-Session-ID: <mock-session-id>
```

### What this tests

This tests that frontend-safe Nuvei config is exposed.

Code under test:

```text
processor/src/routes/operation.route.ts
processor/src/services/nuvei-payment.service.ts
```

Expected response should include safe fields like:

```json
{
  "environment": "test",
  "merchantId": "...",
  "merchantSiteId": "..."
}
```

It must not expose:

```text
NUVEI_SECRET_KEY
CTP_CLIENT_SECRET
checksums
tokens
```

This is a setup endpoint, not the main payment path.

## Endpoint 6: `GET /payment-components`

### Normal caller

```text
commercetools Checkout -> processor
```

### Local endpoint

```text
GET http://localhost:8080/payment-components
```

Normally this uses JWT auth, so for local mock testing either mock/bypass that auth or call it through the same auth shape your test harness provides.

### What this tests

This tests the processor's advertised payment methods.

Code under test:

```text
processor/src/routes/operation.route.ts
processor/src/services/nuvei-payment.service.ts
processor/src/dtos/operations/payment-components.dto.ts
```

Expected:

```json
{
  "components": ["card"],
  "dropins": ["embedded"]
}
```

This confirms Checkout will only ask the enabler to build methods this project actually supports.

## Endpoint 7: `POST /payment-intents/:paymentId`

Use this after authorization works.

### Normal caller

```text
commercetools Payment Intents API / Checkout backend -> processor
```

### Local endpoint

```text
POST http://localhost:8080/payment-intents/payment-local-001
```

### What this tests

This tests server-side post-authorization operations:

```text
capture
cancel authorization
refund
reverse
```

Code under test:

```text
processor/src/routes/operation.route.ts
processor/src/services/nuvei-payment.service.ts
processor/src/clients/nuvei.client.ts
```

Normal downstream calls:

```text
processor -> mock CT getPayment(...)
processor -> Nuvei settleTransaction.do / voidTransaction.do / refundTransaction.do
processor -> mock CT updatePayment(...)
```

Do not start here. Start with `/payments/session`, browser SDK, `/confirm`, and `/webhooks/nuvei`.

## First focused local test: approved card, real Nuvei, mocked CT

Run this exact chain:

```text
1. Browser/enabler calls:
   POST /payments/session

2. Processor calls:
   Nuvei openOrder.do

3. Processor writes:
   mock CT Payment with interfaceId/sessionToken

4. Browser/enabler renders:
   Nuvei SafeCharge SDK using sessionToken

5. Browser submits:
   card 4000027891380961

6. Nuvei SDK calls:
   onResult(...)

7. Browser/enabler calls:
   POST /payments/confirm/payment-local-001

8. Processor calls:
   Nuvei getPaymentStatus.do

9. Processor writes:
   mock CT Authorization Success

10. Nuvei independently calls:
    POST /webhooks/nuvei

11. Processor validates:
    checksum + merchant + amount + currency + Nuvei status

12. Processor writes/skips:
    mock CT update, idempotently
```

## What this proves

It tests these project parts:

```text
enabler/src/components/card.ts
enabler/src/services/api-service.ts
enabler/src/services/nuvei-sdk.ts

processor/src/routes/nuvei-payment.route.ts
processor/src/services/nuvei-payment.service.ts
processor/src/clients/nuvei.client.ts
processor/src/services/ct-payment-creation.service.ts
processor/src/services/converters/nuvei-event.converter.ts
```

It does not test real commercetools yet. That is intentional.

## Key observation this test must produce

The DMN must show exactly how Nuvei correlates the payment:

```text
Does Nuvei send merchant_unique_id = payment-local-001?
Does Nuvei send clientUniqueId = cart-local-001?
Does Nuvei send both?
```

This matters because:

```text
- The enabler passes merchant_unique_id to sfc.createPayment(...).
- The processor DMN handler currently reads body.merchant_unique_id.
- The processor openOrder call currently sends clientUniqueId: cart.id.
```

So this local Nuvei-first test directly validates whether this repo's frontend, processor, and DMN correlation agree.
