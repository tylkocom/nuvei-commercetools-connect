import express from "express";
import crypto from "node:crypto";

const app = express();
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
const port = Number(process.env.PORT ?? 8089);

// ---------------------------------------------------------------------------
// Nuvei real-sandbox helpers (used when env vars are present)
// ---------------------------------------------------------------------------
const NUVEI_API_URL = "https://ppp-test.nuvei.com/ppp/api/v1";

function getTimestamp() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  const seconds = String(now.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function calculateNuveiChecksum(fields, payload, secretKey) {
  const input = fields
    .map((f) => {
      if (f === "secretKey") return secretKey;
      const v = payload[f];
      return v === undefined || v === null ? "" : String(v);
    })
    .join("");
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function callNuveiOpenOrder({ amount, currency, clientUniqueId }) {
  const merchantId = process.env.NUVEI_MERCHANT_ID;
  const merchantSiteId = process.env.NUVEI_MERCHANT_SITE_ID;
  const secretKey = process.env.NUVEI_SECRET_KEY;

  if (!merchantId || !merchantSiteId || !secretKey) {
    throw new Error("Missing NUVEI_MERCHANT_ID, NUVEI_MERCHANT_SITE_ID, or NUVEI_SECRET_KEY");
  }

  const clientRequestId = crypto.randomUUID();
  const timeStamp = getTimestamp();

  const payload = {
    merchantId,
    merchantSiteId,
    clientRequestId,
    amount,
    currency,
    timeStamp,
    clientUniqueId,
  };

  const checksum = calculateNuveiChecksum(
    [
      "merchantId",
      "merchantSiteId",
      "clientRequestId",
      "amount",
      "currency",
      "timeStamp",
      "secretKey",
    ],
    payload,
    secretKey,
  );

  payload.checksum = checksum;

  const response = await fetch(`${NUVEI_API_URL}/openOrder.do`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok || Number(body.errCode) !== 0) {
    const err = new Error(`Nuvei openOrder failed: ${body.reason || JSON.stringify(body)}`);
    err.responseBody = body;
    throw err;
  }
  return body;
}

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

const PROJECT_KEY = "payment-integration";
const SESSION_ID = "session-local-001";
const CART_ID = "cart-local-001";
const INITIAL_PAYMENT_ID = "payment-local-001";
const LOCAL_OAUTH_TOKEN = "mock-ct-access-token";
const OAUTH_SCOPE = "manage_project manage_checkout_payment_intents manage_checkout_transactions introspect_oauth_tokens view_sessions manage_payments";

function mockCartCurrency() {
  return "PLN";
}

function componentPaymentMethods() {
  return [{ type: "card" }, { type: "blik" }];
}

function allowedPaymentMethods() {
  return componentPaymentMethods().map((method) => method.type);
}

function selectionForUiMethod(uiMethod) {
  if (uiMethod === "embedded") return { uiMethod, paymentMethod: "card", integrationSurface: "simply-connect" };
  return { uiMethod, paymentMethod: uiMethod, integrationSurface: "web-sdk" };
}

function isBlikDmn(body) {
  return String(body.payment_method ?? body.paymentMethod ?? body.paymentMethodName ?? "").toLowerCase() === "apmgw_blik";
}

function paymentMethodInfoForTender(tender) {
  return tender === "blik"
    ? { paymentInterface: "nuvei", method: "blik", name: { en: "BLIK" } }
    : { paymentInterface: "nuvei", method: "card", name: { en: "Card" } };
}

function initialTransactionTypeForTender(tender) {
  return tender === "blik" ? "Charge" : "Authorization";
}

function successInterfaceCodeForTransaction(type) {
  if (type === "Authorization") return "authorized";
  if (type === "Charge") return "paid";
  if (type === "Refund") return "refunded";
  if (type === "CancelAuthorization") return "cancelled";
  return "pending";
}

function stateFromNuveiStatus(status) {
  if (status === "OK" || status === "SUCCESS" || status === "APPROVED") return "Success";
  if (status === "PENDING") return "Pending";
  return "Failure";
}

function transactionTypeFromDmn(body) {
  const transactionType = String(body.transactionType ?? "Auth");
  if (isBlikDmn(body) || transactionType === "Sale" || transactionType === "Settle") return "Charge";
  if (transactionType === "Credit") return "Refund";
  if (transactionType === "Void") return "CancelAuthorization";
  return "Authorization";
}

function applyTenderMetadataFromDmn(body) {
  if (!isBlikDmn(body)) return;
  ledger.payment.paymentMethodInfo = paymentMethodInfoForTender("blik");
}

function money(centAmount = 1000, currencyCode = "EUR", fractionDigits = 2) {
  return { centAmount, currencyCode, fractionDigits };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePaymentMethodOptions(body = {}) {
  if (!isPlainObject(body)) return { ok: false, status: 400, code: "REQUEST_MALFORMED", message: "Payment setup request is malformed." };

  const paymentMethodOptions = body.paymentMethodOptions;
  if (paymentMethodOptions === undefined) {
    return { ok: true, paymentMethod: "card", selection: selectionForUiMethod("card") };
  }
  if (!isPlainObject(paymentMethodOptions)) {
    return { ok: false, status: 400, code: "REQUEST_MALFORMED", message: "Payment setup request is malformed." };
  }

  const methods = Object.keys(paymentMethodOptions);
  if (methods.length !== 1 || !methods[0]) {
    return { ok: false, status: 400, code: "REQUEST_MALFORMED", message: "Payment setup request is malformed." };
  }

  const [paymentMethod] = methods;
  if (paymentMethod !== "card" && paymentMethod !== "embedded" && paymentMethod !== "blik") {
    return { ok: false, status: 422, code: "METHOD_UNSUPPORTED", message: "Payment method is not supported." };
  }

  const methodOptions = paymentMethodOptions[paymentMethod];
  if (!isPlainObject(methodOptions) || Object.keys(methodOptions).length > 0) {
    return { ok: false, status: 400, code: "REQUEST_MALFORMED", message: "Payment setup request is malformed." };
  }

  return { ok: true, paymentMethod, selection: selectionForUiMethod(paymentMethod) };
}

function createSession() {
  return {
    id: SESSION_ID,
    version: 1,
    state: "ACTIVE",
    activeCart: {
      cartRef: { id: CART_ID, typeId: "cart" },
    },
    metadata: {
      allowedPaymentMethods: allowedPaymentMethods(),
      processorUrl: process.env.PROCESSOR_URL ?? "http://localhost:8080",
      paymentInterface: "nuvei",
      merchantReturnUrl: "http://localhost:8089/return",
      correlationId: "correlation-local-001",
    },
  };
}

function createCart() {
  return {
    id: CART_ID,
    version: 1,
    cartState: "Active",
    paymentInfo: {
      payments: [{ id: INITIAL_PAYMENT_ID, typeId: "payment" }],
    },
    totalPrice: money(1000, mockCartCurrency()),
  };
}

function createPayment({ id = INITIAL_PAYMENT_ID, interfaceId = null, amountPlanned = money(1000, mockCartCurrency()), paymentMethodInfo, transactions = [] } = {}) {
  return {
    id,
    version: 1,
    interfaceId,
    amountPlanned: clone(amountPlanned),
    paymentMethodInfo: paymentMethodInfo ?? paymentMethodInfoForTender("card"),
    transactions: clone(transactions),
    paymentStatus: {
      interfaceCode: "pending",
    },
  };
}

function createLedger() {
  const payment = createPayment();
  return {
    session: createSession(),
    cart: createCart(),
    payment,
    payments: { [payment.id]: payment },
    paymentSequence: 1,
    lastRequests: [],
  };
}

let ledger = createLedger();

function sanitizeForLog(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("authorization") ||
        normalizedKey.includes("token") ||
        normalizedKey.includes("checksum") ||
        normalizedKey.includes("secret") ||
        normalizedKey.includes("cardnumber") ||
        normalizedKey === "cvv" ||
        normalizedKey === "blik_code" ||
        normalizedKey === "code"
      ) {
        return [key, "[redacted]"];
      }
      return [key, sanitizeForLog(entryValue)];
    }),
  );
}

function record(direction, label, req, extra = {}) {
  const entry = {
    at: new Date().toISOString(),
    direction,
    label,
    method: req.method,
    path: req.originalUrl,
    headers: sanitizeForLog(req.headers),
    body: sanitizeForLog(req.body),
    rawBody: req.rawBody ? "[redacted-raw-body]" : "",
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
  return upsertTransactionOnPayment(ledger.payment, transaction);
}


function paymentReference(id) {
  return { id, typeId: "payment" };
}

function nextPaymentId() {
  ledger.paymentSequence += 1;
  return `payment-local-${String(ledger.paymentSequence).padStart(3, "0")}`;
}

function ensureProject(req, res) {
  if (req.params.projectKey !== undefined && req.params.projectKey !== PROJECT_KEY) {
    res.status(404).json({ message: "Project not found" });
    return false;
  }
  return true;
}

function getPaymentOr404(id, res) {
  const payment = ledger.payments[id];
  if (!payment) {
    res.status(404).json({ message: "Payment not found" });
    return undefined;
  }
  return payment;
}

function attachPaymentToCart(paymentId) {
  const payments = ledger.cart.paymentInfo.payments;
  if (!payments.some((ref) => ref.id === paymentId)) {
    payments.push(paymentReference(paymentId));
    ledger.cart.version += 1;
  }
}

function applyCartActions(cart, actions = []) {
  for (const action of actions) {
    if (action.action === "addPayment" && action.payment?.id) {
      attachPaymentToCart(action.payment.id);
    }
    if (action.action === "freezeCart") {
      cart.cartState = "Frozen";
      cart.version += 1;
    }
    if (action.action === "unfreezeCart") {
      cart.cartState = "Active";
      cart.version += 1;
    }
  }
  return cart;
}

function applyPaymentActions(payment, actions = []) {
  for (const action of actions) {
    if (action.action === "setInterfaceId") {
      payment.interfaceId = action.interfaceId;
    } else if (action.action === "setMethodInfoMethod") {
      payment.paymentMethodInfo.method = action.method;
    } else if (action.action === "setMethodInfoName") {
      payment.paymentMethodInfo.name = action.name;
    } else if (action.action === "setMethodInfoInterface") {
      payment.paymentMethodInfo.paymentInterface = action.interface;
    } else if (action.action === "setMethodInfoToken") {
      payment.paymentMethodInfo.token = action.token;
    } else if (action.action === "addTransaction" && action.transaction) {
      upsertTransactionOnPayment(payment, {
        ...action.transaction,
        id: action.transaction.id ?? crypto.randomUUID(),
      });
    } else if (action.action === "changeTransactionState") {
      const tx = payment.transactions.find((candidate) => candidate.id === action.transactionId);
      if (tx) tx.state = action.state;
    } else if (action.action === "changeTransactionInteractionId") {
      const tx = payment.transactions.find((candidate) => candidate.id === action.transactionId);
      if (tx) tx.interactionId = action.interactionId;
    } else if (action.action === "setTransactionInterfaceId") {
      const tx = payment.transactions.find((candidate) => candidate.id === action.transactionId);
      if (tx) tx.interfaceId = action.interfaceId;
    } else if (action.action === "addInterfaceInteraction") {
      payment.interfaceInteractions = payment.interfaceInteractions ?? [];
      payment.interfaceInteractions.push({ ...action, action: undefined });
    }
  }
  payment.version += 1;
  return payment;
}

function upsertTransactionOnPayment(payment, transaction) {
  const existing = payment.transactions.find(
    (candidate) => candidate.interactionId && candidate.interactionId === transaction.interactionId,
  );

  if (existing) {
    Object.assign(existing, transaction);
    return { inserted: false, transaction: existing };
  }

  payment.transactions.push(transaction);
  return { inserted: true, transaction };
}

function findPayments(where) {
  const payments = Object.values(ledger.payments);
  if (!where) return payments;

  const interfaceMatch = String(where).match(/interfaceId\s*=\s*"([^"]+)"/);
  if (interfaceMatch) {
    return payments.filter((payment) => payment.interfaceId === interfaceMatch[1]);
  }

  return payments;
}
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mock-ct" });
});

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
  ledger = createLedger();
  res.json({ ok: true, ledger });
});

app.post("/oauth/token", (req, res) => {
  record("INBOUND", "Mock CT OAuth token", req);
  res.json({
    access_token: LOCAL_OAUTH_TOKEN,
    token_type: "Bearer",
    expires_in: 3600,
    scope: OAUTH_SCOPE,
  });
});

app.post("/oauth/introspect", (req, res) => {
  record("INBOUND", "Mock CT OAuth introspect", req);
  res.json({
    active: true,
    client_id: process.env.CTP_CLIENT_ID ?? "local-client",
    scope: OAUTH_SCOPE,
  });
});

app.get("/payment-integration/sessions/:sessionId", (req, res) => {
  record("INBOUND", "Mock CT get session", req);
  if (!ensureProject(req, res)) return;
  if (req.params.sessionId !== SESSION_ID) {
    res.status(404).json({ message: "Session not found" });
    return;
  }
  res.json(ledger.session);
});

app.get("/payment-integration/carts/:id", (req, res) => {
  record("INBOUND", "Mock CT get cart", req);
  if (!ensureProject(req, res)) return;
  if (req.params.id !== ledger.cart.id) {
    res.status(404).json({ message: "Cart not found" });
    return;
  }
  res.json(ledger.cart);
});

app.post("/payment-integration/carts/:id", (req, res) => {
  record("INBOUND", "Mock CT update cart", req);
  if (!ensureProject(req, res)) return;
  if (req.params.id !== ledger.cart.id) {
    res.status(404).json({ message: "Cart not found" });
    return;
  }
  applyCartActions(ledger.cart, req.body?.actions ?? []);
  res.json(ledger.cart);
});

app.get("/payment-integration/payments", (req, res) => {
  record("INBOUND", "Mock CT query payments", req);
  if (!ensureProject(req, res)) return;
  const results = findPayments(req.query.where);
  res.json({ count: results.length, total: results.length, offset: 0, results });
});

app.post("/payment-integration/payments", (req, res) => {
  record("INBOUND", "Mock CT create payment", req);
  if (!ensureProject(req, res)) return;
  const payment = createPayment({
    id: nextPaymentId(),
    interfaceId: req.body?.interfaceId ?? null,
    amountPlanned: req.body?.amountPlanned ?? ledger.cart.totalPrice,
    paymentMethodInfo: req.body?.paymentMethodInfo,
    transactions: req.body?.transactions ?? [],
  });
  ledger.payments[payment.id] = payment;
  ledger.payment = payment;
  res.status(201).json(payment);
});

app.get("/payment-integration/payments/:id", (req, res) => {
  record("INBOUND", "Mock CT get payment", req);
  if (!ensureProject(req, res)) return;
  const payment = getPaymentOr404(req.params.id, res);
  if (!payment) return;
  res.json(payment);
});

app.post("/payment-integration/payments/:id", (req, res) => {
  record("INBOUND", "Mock CT update payment", req);
  if (!ensureProject(req, res)) return;
  const payment = getPaymentOr404(req.params.id, res);
  if (!payment) return;
  applyPaymentActions(payment, req.body?.actions ?? []);
  res.json(payment);
});

app.get("/config", (req, res) => {
  record("INBOUND", "Frontend-safe Nuvei config", req);
  res.json({
    environment: process.env.NUVEI_ENV ?? "test",
    merchantId: process.env.NUVEI_MERCHANT_ID ?? "mock-merchant-id",
    merchantSiteId: process.env.NUVEI_MERCHANT_SITE_ID ?? "mock-merchant-site-id",
  });
});

function sendPaymentComponents(req, res) {
  record("INBOUND", "Supported payment components", req);
  res.json({
    dropins: [{ type: "embedded" }],
    components: componentPaymentMethods(),
    express: [],
  });
}

app.get("/payment-components", sendPaymentComponents);
app.get("/operations/payment-components", sendPaymentComponents);

app.post("/payments/session", async (req, res) => {
  record("INBOUND", "Create payment session", req, {
    normalCaller: "enabler browser code -> processor",
    testedFlow:
      "processor Nuvei openOrder creation path; calls real Nuvei sandbox when credentials are present",
  });

  const paymentMethodResult = validatePaymentMethodOptions(req.body);
  if (!paymentMethodResult.ok) {
    return res
      .status(paymentMethodResult.status)
      .json({ code: paymentMethodResult.code, message: paymentMethodResult.message });
  }

  const hasNuveiCreds =
    process.env.NUVEI_MERCHANT_ID &&
    process.env.NUVEI_MERCHANT_SITE_ID &&
    process.env.NUVEI_SECRET_KEY;

  let sessionToken;
  let orderId;

  if (hasNuveiCreds) {
    try {
      const amountStr = (ledger.cart.totalPrice.centAmount / 100).toFixed(2);
      const nuveiRes = await callNuveiOpenOrder({
        amount: amountStr,
        currency: ledger.cart.totalPrice.currencyCode,
        clientUniqueId: ledger.cart.id,
      });
      sessionToken = nuveiRes.sessionToken;
      orderId = nuveiRes.orderId;
      console.log("Nuvei openOrder succeeded:", {
        orderId,
        hasSessionToken: typeof sessionToken === "string" && sessionToken.length > 0,
        sessionTokenLength: typeof sessionToken === "string" ? sessionToken.length : 0,
      });
    } catch (err) {
      console.error("Nuvei openOrder failed:", err.message);
      return res.status(502).json({
        message: "Nuvei openOrder failed",
        detail: err.message,
      });
    }
  } else {
    sessionToken = `mock-session-token-${crypto.randomUUID()}`;
    console.log("No Nuvei creds found; returning mock session token.");
  }

  const { selection } = paymentMethodResult;
  ledger.payment.interfaceId = sessionToken;
  ledger.payment.amountPlanned = clone(ledger.cart.totalPrice);
  ledger.payment.paymentMethodInfo = paymentMethodInfoForTender(selection.paymentMethod);
  ledger.payment.transactions = [
    {
      id: crypto.randomUUID(),
      type: initialTransactionTypeForTender(selection.paymentMethod),
      state: "Initial",
      amount: ledger.payment.amountPlanned,
      interactionId: sessionToken,
    },
  ];

  res.json({
    cartId: ledger.cart.id,
    sessionToken,
    paymentReference: ledger.payment.id,
    merchantReturnUrl: "http://localhost:8089/return",
    amount: (ledger.cart.totalPrice.centAmount / 100).toFixed(2),
    currency: ledger.cart.totalPrice.currencyCode,
    uiMethod: selection.uiMethod,
    paymentMethod: selection.paymentMethod,
    integrationSurface: selection.integrationSurface,
    ...(selection.paymentMethod === "blik" ? { countryCode: "PL" } : {}),
    ...(orderId ? { orderId } : {}),
  });
});

app.post("/payments/confirm/:id", (req, res) => {
  record("INBOUND", "Confirm payment after Nuvei widget result", req, {
    normalCaller: "enabler browser code -> processor",
    testedFlow: "processor Nuvei getPaymentStatus verification path; mocked here as approved",
  });

  const transactionId = `mock-nuvei-transaction-${crypto.randomUUID()}`;
  ledger.payment.interfaceId = req.body?.sessionToken ?? ledger.payment.interfaceId;
  const type = initialTransactionTypeForTender(ledger.payment.paymentMethodInfo.method);
  ledger.payment.paymentStatus.interfaceCode = successInterfaceCodeForTransaction(type);
  upsertTransaction({
    id: crypto.randomUUID(),
    type,
    state: "Success",
    amount: ledger.payment.amountPlanned,
    interactionId: transactionId,
  });

  res.json({ outcome: "approved" });
});

app.post("/webhooks/nuvei", (req, res) => {
  record("INBOUND", "Nuvei DMN webhook", req, {
    normalCaller: "Nuvei sandbox -> processor",
    testedFlow:
      "processor DMN checksum/correlation/update path; checksum not enforced by this mock",
  });

  const body = req.body ?? {};
  const status = String(body.Status ?? body.ppp_status ?? "OK").toUpperCase();
  const interactionId = transactionIdFromBody(body);
  const amount = {
    centAmount: amountFromBody(body),
    currencyCode: String(body.currency ?? ledger.payment.amountPlanned.currencyCode),
    fractionDigits: 2,
  };

  applyTenderMetadataFromDmn(body);
  const type = transactionTypeFromDmn(body);
  const state = stateFromNuveiStatus(status);

  const result = upsertTransaction({
    id: crypto.randomUUID(),
    type,
    state,
    amount,
    interactionId,
  });

  if (state === "Success") ledger.payment.paymentStatus.interfaceCode = successInterfaceCodeForTransaction(type);
  if (state === "Pending") ledger.payment.paymentStatus.interfaceCode = "pending";

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
  console.log("Run from examples/nuvei-web-ui/: npm install && npm start");
});
