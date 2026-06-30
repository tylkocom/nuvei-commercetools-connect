import type { Payment } from "@commercetools/platform-sdk";
import { getCurrencyFractionDigits, scaleToCentAmount } from "./money.js";

/**
 * Pure Nuvei response/status parsing and validation helpers shared by payment
 * confirmation, payment operations, and DMN reconciliation. None touch
 * services or clients — they only read Nuvei payloads and commercetools
 * Payments — so they are free of this-binding and trivially unit-testable.
 */

// ---------------------------------------------------------------------------
// Nuvei terminal identity
// Prefer PPP_TransactionID when Nuvei provides it, but getPaymentStatus can
// return approved/rejected terminal status without PPP. In that case the lower
// camel fiscal transactionId is the best terminal PSP identifier available.
// If Nuvei omits every transaction identifier, fall back to the session token:
// it is unique per openOrder and already bound to this CT Payment by interfaceId.
// ---------------------------------------------------------------------------
const PPP_TRANSACTION_ID_KEYS = [
  "PPP_TransactionID",
  "PPP_TransactionId",
  "ppp_TransactionID",
] as const;

const FALLBACK_TRANSACTION_ID_KEYS = [
  "transactionId",
  "TransactionID",
  "TransactionId",
  "transactionID",
] as const;

export type NuveiTerminalIdentitySource = "ppp" | "transactionId" | "sessionToken";

export type NuveiTerminalIdentity = {
  interactionId: string;
  pspReference: string;
  source: NuveiTerminalIdentitySource;
};

function getNonEmptyString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Extract the canonical Nuvei PPP transaction ID from a Nuvei status/DMN body. */
export function extractCanonicalPpp(body: Record<string, unknown>): string | undefined {
  for (const key of PPP_TRANSACTION_ID_KEYS) {
    const value = getNonEmptyString(body, key);
    if (value) return value;
  }
  return undefined;
}

export function extractNuveiTransactionIdentities(body: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const key of [...PPP_TRANSACTION_ID_KEYS, ...FALLBACK_TRANSACTION_ID_KEYS]) {
    const value = getNonEmptyString(body, key);
    if (value && !ids.includes(value)) {
      ids.push(value);
    }
  }
  return ids;
}

export function extractNuveiTerminalIdentity(
  body: Record<string, unknown>,
  sessionToken: string,
): NuveiTerminalIdentity {
  const ppp = extractCanonicalPpp(body);
  if (ppp) {
    return { interactionId: ppp, pspReference: ppp, source: "ppp" };
  }

  for (const key of FALLBACK_TRANSACTION_ID_KEYS) {
    const transactionId = getNonEmptyString(body, key);
    if (transactionId) {
      return {
        interactionId: transactionId,
        pspReference: transactionId,
        source: "transactionId",
      };
    }
  }

  return { interactionId: sessionToken, pspReference: sessionToken, source: "sessionToken" };
}

/**
 * Strict Nuvei status classifier (D-08):
 * - approved: status=SUCCESS AND transactionStatus=APPROVED
 * - rejected: status=SUCCESS AND transactionStatus in {DECLINED, ERROR}
 * - pending: everything else (unknown, missing, PENDING, UPDATE, cashier ERROR, etc.)
 */
export function classifyNuveiStatus(
  status: unknown,
  transactionStatus: unknown,
): "approved" | "rejected" | "pending" {
  if (status === "SUCCESS") {
    if (transactionStatus === "APPROVED") return "approved";
    if (transactionStatus === "DECLINED" || transactionStatus === "ERROR") return "rejected";
  }
  return "pending";
}

// ---------------------------------------------------------------------------
// Amount parsing/formatting
// ---------------------------------------------------------------------------

export function formatAmount(amount: {
  centAmount: number;
  currencyCode: string;
  fractionDigits?: number;
}): string {
  const fractionDigits = amount.fractionDigits ?? getCurrencyFractionDigits(amount.currencyCode);
  return (amount.centAmount / 10 ** fractionDigits).toFixed(fractionDigits);
}

export function parseAmountToCentAmount(amount: unknown, currencyCode: string): number {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount)) {
    throw new Error("Invalid Nuvei amount");
  }
  return scaleToCentAmount(parsedAmount, currencyCode);
}

// ---------------------------------------------------------------------------
// Status/payment assertion
// ---------------------------------------------------------------------------

/** Minimal structural slice of a Nuvei status body that the assertion reads.
 * Accepts a typed PaymentStatusResponse or any looser record with these fields. */
type NuveiStatusAmountBody = {
  clientUniqueId?: unknown;
  currency?: unknown;
  amount?: unknown;
};

export function assertNuveiStatusMatchesPayment(
  statusBody: NuveiStatusAmountBody,
  payment: Payment,
  cartId: string,
  requireFinancialFields = false,
): void {
  const clientUniqueId = statusBody.clientUniqueId;
  if (clientUniqueId !== undefined && String(clientUniqueId) !== cartId) {
    throw new Error("Nuvei payment status does not match cart");
  }

  const currency = statusBody.currency;
  if (requireFinancialFields && currency === undefined) {
    throw new Error("Nuvei payment status is missing currency");
  }
  if (currency !== undefined && String(currency) !== payment.amountPlanned.currencyCode) {
    throw new Error("Nuvei payment status currency does not match payment");
  }

  const amount = statusBody.amount;
  if (requireFinancialFields && amount === undefined) {
    throw new Error("Nuvei payment status is missing amount");
  }
  if (amount !== undefined) {
    const statusCentAmount = parseAmountToCentAmount(amount, payment.amountPlanned.currencyCode);
    if (statusCentAmount !== payment.amountPlanned.centAmount) {
      throw new Error("Nuvei payment status amount does not match payment");
    }
  }
}
