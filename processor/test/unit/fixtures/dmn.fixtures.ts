/**
 * DMN (Direct Merchant Notification) fixture data for Nuvei webhook tests.
 *
 * Each fixture represents a realistic Nuvei DMN payload that the processor
 * might receive. Fields are modelled after the actual Nuvei DMN spec.
 */

// ---------------------------------------------------------------------------
// Base helpers
// ---------------------------------------------------------------------------

/** Fields common to every DMN payload (checksum omitted – set by tests). */
function baseDmnFields(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    merchant_id: "merchant-123",
    merchant_site_id: "site-456",
    merchant_unique_id: "payment-1",
    clientUniqueId: "cart-123",
    currency: "USD",
    responseTimeStamp: "2025-06-15T12:00:00",
    productId: "prod-1",
    PPP_TransactionID: "50001",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Successful Authorization  (Auth, OK)
// ---------------------------------------------------------------------------

export const dmnAuthOk: Record<string, unknown> = baseDmnFields({
  TransactionID: "tx-auth-001",
  transactionType: "Auth",
  ppp_status: "OK",
  Status: "APPROVED",
  totalAmount: "10.00",
  ErrCode: "0",
  cardCompany: "Visa",
  cardType: "Credit Card",
});

// ---------------------------------------------------------------------------
// Failed Authorization  (Auth, FAIL)
// ---------------------------------------------------------------------------

export const dmnAuthFail: Record<string, unknown> = baseDmnFields({
  TransactionID: "tx-auth-fail-001",
  transactionType: "Auth",
  ppp_status: "FAIL",
  Status: "DECLINED",
  totalAmount: "10.00",
  ErrCode: "1001",
});

// ---------------------------------------------------------------------------
// Successful Charge / Settle  (Settle, OK)
// ---------------------------------------------------------------------------

export const dmnSettleOk: Record<string, unknown> = baseDmnFields({
  TransactionID: "tx-settle-001",
  transactionType: "Settle",
  ppp_status: "OK",
  Status: "APPROVED",
  totalAmount: "10.00",
  ErrCode: "0",
  cardCompany: "Visa",
  cardType: "Credit Card",
});

// ---------------------------------------------------------------------------
// Successful Refund  (Credit, OK)
// ---------------------------------------------------------------------------

export const dmnCreditOk: Record<string, unknown> = baseDmnFields({
  TransactionID: "tx-credit-001",
  transactionType: "Credit",
  ppp_status: "OK",
  Status: "APPROVED",
  totalAmount: "10.00",
  ErrCode: "0",
});

// ---------------------------------------------------------------------------
// Successful Void / Cancel  (Void, OK)
// ---------------------------------------------------------------------------

export const dmnVoidOk: Record<string, unknown> = baseDmnFields({
  TransactionID: "tx-void-001",
  transactionType: "Void",
  ppp_status: "OK",
  Status: "APPROVED",
  totalAmount: "10.00",
  ErrCode: "0",
});

// ---------------------------------------------------------------------------
// Duplicate DMN – same TransactionID as dmnAuthOk
// ---------------------------------------------------------------------------

export const dmnDuplicateAuth: Record<string, unknown> = baseDmnFields({
  TransactionID: "tx-auth-001", // same as dmnAuthOk
  transactionType: "Auth",
  ppp_status: "OK",
  Status: "APPROVED",
  totalAmount: "10.00",
  ErrCode: "0",
});

// ---------------------------------------------------------------------------
// Malformed DMN – missing required fields (no TransactionID, no totalAmount)
// ---------------------------------------------------------------------------

export const dmnMalformed: Record<string, unknown> = {
  merchant_id: "merchant-123",
  merchant_unique_id: "payment-1",
  // Missing: TransactionID, totalAmount, transactionType, ppp_status, currency
};

// ---------------------------------------------------------------------------
// Mismatched merchant_id
// ---------------------------------------------------------------------------

export const dmnMerchantMismatch: Record<string, unknown> = baseDmnFields({
  TransactionID: "tx-mismatch-001",
  transactionType: "Auth",
  ppp_status: "OK",
  Status: "APPROVED",
  totalAmount: "10.00",
  merchant_id: "wrong-merchant-999", // does NOT match config merchant-123
  ErrCode: "0",
});

// ---------------------------------------------------------------------------
// Currency mismatch
// ---------------------------------------------------------------------------

export const dmnCurrencyMismatch: Record<string, unknown> = baseDmnFields({
  TransactionID: "tx-currency-mismatch-001",
  transactionType: "Auth",
  ppp_status: "OK",
  Status: "APPROVED",
  totalAmount: "10.00",
  currency: "EUR", // payment is planned in USD
  ErrCode: "0",
});

// ---------------------------------------------------------------------------
// Amount mismatch – totalAmount 99.99 vs planned 10.00 (1000 cents)
// ---------------------------------------------------------------------------

export const dmnAmountMismatch: Record<string, unknown> = baseDmnFields({
  TransactionID: "tx-amount-mismatch-001",
  transactionType: "Auth",
  ppp_status: "OK",
  Status: "APPROVED",
  totalAmount: "99.99",
  currency: "USD",
  ErrCode: "0",
});

// ---------------------------------------------------------------------------
// Missing merchant_unique_id
// ---------------------------------------------------------------------------

export const dmnMissingMerchantUniqueId: Record<string, unknown> = baseDmnFields({
  TransactionID: "tx-no-ref-001",
  transactionType: "Auth",
  ppp_status: "OK",
  Status: "APPROVED",
  totalAmount: "10.00",
});

// Delete the field so it is truly absent (not just undefined)
delete (dmnMissingMerchantUniqueId as Record<string, unknown>).merchant_unique_id;

// ---------------------------------------------------------------------------
// Helper – mock CT Payment object matching fixture amounts
// ---------------------------------------------------------------------------

export interface MockPayment {
  id: string;
  interfaceId: string;
  amountPlanned: { centAmount: number; currencyCode: string };
  transactions: Array<{
    type: string;
    state: string;
    interactionId: string;
    amount?: { centAmount: number; currencyCode: string };
  }>;
}

/**
 * Build a mock CT Payment that matches the standard fixture amounts
 * (1000 cents USD). Pass `transactions` to simulate existing transactions.
 */
export function makeDmnMockPayment(overrides: Partial<MockPayment> = {}): MockPayment {
  return {
    id: "payment-1",
    interfaceId: "nuvei-session-token",
    amountPlanned: { centAmount: 1000, currencyCode: "USD" },
    transactions: [],
    ...overrides,
  };
}

/**
 * Build a mock Nuvei getPaymentStatus response that confirms a successful
 * DMN transaction.
 */
export function makePaymentStatusResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: "SUCCESS",
    transactionStatus: "APPROVED",
    transactionId: "tx-auth-001",
    sessionToken: "nuvei-session-token",
    amount: "10.00",
    currency: "USD",
    clientUniqueId: "cart-123",
    ...overrides,
  };
}
