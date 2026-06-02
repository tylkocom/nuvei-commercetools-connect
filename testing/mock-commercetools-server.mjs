import express from "express";
import crypto from "node:crypto";

const app = express();
const port = Number(process.env.PORT ?? 8089);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);
app.use(
  express.urlencoded({
    extended: false,
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);

const ledger = {
  cart: {
    id: "cart-local-001",
    paymentInfo: {
      payments: [{ id: "payment-local-001", typeId: "payment" }],
    },
    totalPrice: {
      centAmount: 1000,
      currencyCode: "EUR",
      fractionDigits: 2,
    },
  },
  payment: {
    id: "payment-local-001",
    interfaceId: null,
    amountPlanned: {
      centAmount: 1000,
      currencyCode: "EUR",
      fractionDigits: 2,
    },
    paymentMethodInfo: {
      paymentInterface: "nuvei",
      method: "card",
    },
    transactions: [],
    paymentStatus: {
      interfaceCode: "pending",
    },
  },
  lastRequests: [],
};

function record(direction, label, req, extra = {}) {
  const entry = {
    at: new Date().toISOString(),
    direction,
    label,
    method: req.method,
    path: req.originalUrl,
    headers: req.headers,
    body: req.body,
    rawBody: req.rawBody ?? "",
    ...extra,
  };

  ledger.lastRequests.unshift(entry);
  ledger.lastRequests.length = Math.min(ledger.lastRequests.length, 50);

  console.log(JSON.stringify(entry, null, 2));
}

function amountFromBody(body) {
  const raw = body.totalAmount ?? body.amount ?? "10.00";
  const decimal = Number.parseFloat(String(raw));
  if (!Number.isFinite(decimal)) return ledger.payment.amountPlanned.centAmount;
  return Math.round(decimal * 100);
}

function transactionIdFromBody(body) {
  return String(
    body.TransactionID ??
      body.TransactionId ??
      body.transactionId ??
      body.PPP_TransactionID ??
      body.PPP_TransactionId ??
      crypto.randomUUID(),
  );
}

function upsertTransaction(transaction) {
  const existing = ledger.payment.transactions.find(
    (candidate) => candidate.interactionId === transaction.interactionId,
  );

  if (existing) {
    Object.assign(existing, transaction);
    return { inserted: false, transaction: existing };
  }

  ledger.payment.transactions.push(transaction);
  return { inserted: true, transaction };
}

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Nuvei local mock CT server</title></head>
  <body>
    <h1>Nuvei local mock CT server</h1>
    <p>Useful endpoints:</p>
    <ul>
      <li><a href="/ledger">GET /ledger</a></li>
      <li><a href="/config">GET /config</a></li>
      <li><a href="/payment-components">GET /payment-components</a></li>
      <li>POST /payments/session</li>
      <li>POST /payments/confirm/payment-local-001</li>
      <li>POST /webhooks/nuvei</li>
      <li>POST /payment-intents/payment-local-001</li>
    </ul>
  </body>
</html>`);
});

app.get("/ledger", (req, res) => {
  record("INBOUND", "Inspect mock CT ledger", req);
  res.json(ledger);
});

app.post("/reset", (req, res) => {
  record("INBOUND", "Reset mock CT ledger", req);
  ledger.payment.interfaceId = null;
  ledger.payment.transactions = [];
  ledger.payment.paymentStatus.interfaceCode = "pending";
  ledger.lastRequests = [];
  res.json({ ok: true, ledger });
});

app.get("/config", (req, res) => {
  record("INBOUND", "Frontend-safe Nuvei config", req);
  res.json({
    environment: process.env.NUVEI_ENV ?? "test",
    merchantId: process.env.NUVEI_MERCHANT_ID ?? "mock-merchant-id",
    merchantSiteId: process.env.NUVEI_MERCHANT_SITE_ID ?? "mock-merchant-site-id",
  });
});

app.get("/payment-components", (req, res) => {
  record("INBOUND", "Supported payment components", req);
  res.json({
    components: ["card"],
    dropins: ["embedded"],
  });
});

app.post("/payments/session", (req, res) => {
  record("INBOUND", "Create payment session", req, {
    normalCaller: "enabler browser code -> processor",
    testedFlow: "processor Nuvei openOrder creation path; mocked here with hard-coded session token",
  });

  const sessionToken = `mock-session-token-${crypto.randomUUID()}`;
  ledger.payment.interfaceId = sessionToken;
  ledger.payment.paymentMethodInfo.method = req.body?.paymentMethodOptions?.embedded ? "embedded" : "card";

  res.json({
    cartId: ledger.cart.id,
    sessionToken,
    paymentReference: ledger.payment.id,
    merchantReturnUrl: "http://localhost:8089/return",
  });
});

app.post("/payments/confirm/:id", (req, res) => {
  record("INBOUND", "Confirm payment after Nuvei widget result", req, {
    normalCaller: "enabler browser code -> processor",
    testedFlow: "processor Nuvei getPaymentStatus verification path; mocked here as approved",
  });

  const transactionId = `mock-nuvei-transaction-${crypto.randomUUID()}`;
  ledger.payment.interfaceId = req.body?.sessionToken ?? ledger.payment.interfaceId;
  ledger.payment.paymentStatus.interfaceCode = "authorized";
  upsertTransaction({
    id: crypto.randomUUID(),
    type: "Authorization",
    state: "Success",
    amount: ledger.payment.amountPlanned,
    interactionId: transactionId,
  });

  res.json({ outcome: "approved" });
});

app.post("/webhooks/nuvei", (req, res) => {
  record("INBOUND", "Nuvei DMN webhook", req, {
    normalCaller: "Nuvei sandbox -> processor",
    testedFlow: "processor DMN checksum/correlation/update path; checksum not enforced by this mock",
  });

  const body = req.body ?? {};
  const status = String(body.Status ?? body.ppp_status ?? "OK").toUpperCase();
  const transactionType = String(body.transactionType ?? "Auth");
  const interactionId = transactionIdFromBody(body);
  const amount = {
    centAmount: amountFromBody(body),
    currencyCode: String(body.currency ?? ledger.payment.amountPlanned.currencyCode),
    fractionDigits: 2,
  };

  const type =
    transactionType === "Settle"
      ? "Charge"
      : transactionType === "Credit"
        ? "Refund"
        : transactionType === "Void"
          ? "CancelAuthorization"
          : "Authorization";

  const state = status === "OK" || status === "SUCCESS" ? "Success" : "Failure";

  const result = upsertTransaction({
    id: crypto.randomUUID(),
    type,
    state,
    amount,
    interactionId,
  });

  if (type === "Authorization" && state === "Success") ledger.payment.paymentStatus.interfaceCode = "authorized";
  if (type === "Charge" && state === "Success") ledger.payment.paymentStatus.interfaceCode = "paid";
  if (type === "Refund" && state === "Success") ledger.payment.paymentStatus.interfaceCode = "refunded";
  if (type === "CancelAuthorization" && state === "Success") ledger.payment.paymentStatus.interfaceCode = "cancelled";

  res.json({
    ok: true,
    idempotentSkip: !result.inserted,
    paymentId: ledger.payment.id,
    transaction: result.transaction,
  });
});

app.post("/payment-intents/:id", (req, res) => {
  record("INBOUND", "Payment intent operation", req, {
    normalCaller: "commercetools Payment Intents API / Checkout backend -> processor",
    testedFlow: "capture/cancel/refund/reverse path; mocked here from action field",
  });

  const action = String(req.body?.action ?? req.body?.operation ?? "capturePayment");
  const transactionId = `mock-nuvei-operation-${crypto.randomUUID()}`;

  let type = "Charge";
  let interfaceCode = "paid";
  if (action.includes("cancel")) {
    type = "CancelAuthorization";
    interfaceCode = "cancelled";
  } else if (action.includes("refund") || action.includes("reverse")) {
    type = "Refund";
    interfaceCode = "refunded";
  }

  ledger.payment.paymentStatus.interfaceCode = interfaceCode;
  const result = upsertTransaction({
    id: crypto.randomUUID(),
    type,
    state: "Success",
    amount: ledger.payment.amountPlanned,
    interactionId: transactionId,
  });

  res.json({
    outcome: "approved",
    transaction: result.transaction,
  });
});

app.get("/mock-ct/carts/:id", (req, res) => {
  record("INBOUND", "Mock CT getCart", req);
  if (req.params.id !== ledger.cart.id) {
    res.status(404).json({ message: "Cart not found" });
    return;
  }
  res.json(ledger.cart);
});

app.get("/mock-ct/payments/:id", (req, res) => {
  record("INBOUND", "Mock CT getPayment", req);
  if (req.params.id !== ledger.payment.id) {
    res.status(404).json({ message: "Payment not found" });
    return;
  }
  res.json(ledger.payment);
});

app.listen(port, () => {
  console.log(`Nuvei local mock CT server listening on http://localhost:${port}`);
  console.log("Run from testing/: npm install && npm start");
});
