import type { Payment } from "@commercetools/platform-sdk";
import { PaymentTransactions } from "../dtos/operations/payment-intents.dto.js";
import type { NuveiDmnUpdateData } from "./converters/nuvei-event.converter.js";

/**
 * Pure payment/transaction-state helpers shared across payment confirmation,
 * payment operations, and DMN reconciliation. None of these touch services,
 * clients, or config — they only inspect commercetools Payment and Nuvei DMN
 * data — so they are trivially unit-testable and free of this-binding hazards.
 */

export function paymentHasInteraction(payment: Payment, interactionId: string): boolean {
  return (
    payment.interfaceId === interactionId ||
    (payment.transactions ?? []).some((tx) => tx.interactionId === interactionId)
  );
}

export function transactionMatchesPlannedAmount(
  payment: Payment,
  transaction: Payment["transactions"][number],
): boolean {
  const amount = transaction.amount;
  return (
    amount !== undefined &&
    amount.centAmount === payment.amountPlanned.centAmount &&
    amount.currencyCode === payment.amountPlanned.currencyCode
  );
}

export function getExistingTerminalOutcome(
  payment: Payment,
): "approved" | "rejected" | undefined {
  const transactions = payment.transactions ?? [];
  const hasSuccessfulPayment = transactions.some(
    (tx) =>
      tx.state === "Success" &&
      (tx.type === PaymentTransactions.AUTHORIZATION || tx.type === PaymentTransactions.CHARGE) &&
      transactionMatchesPlannedAmount(payment, tx),
  );

  if (hasSuccessfulPayment) {
    return "approved";
  }

  const hasFailedPayment = transactions.some(
    (tx) =>
      tx.state === "Failure" &&
      (tx.type === PaymentTransactions.AUTHORIZATION || tx.type === PaymentTransactions.CHARGE) &&
      transactionMatchesPlannedAmount(payment, tx),
  );

  return hasFailedPayment ? "rejected" : undefined;
}

export function hasTerminalTransaction(
  payment: Payment,
  opts: { type: string; state: string; interactionId: string },
): boolean {
  return (payment.transactions ?? []).some(
    (tx) => tx.type === opts.type && tx.state === opts.state && tx.interactionId === opts.interactionId,
  );
}

export function getConfirmTerminalTransactionType(
  statusBody: Record<string, unknown>,
): typeof PaymentTransactions.AUTHORIZATION | typeof PaymentTransactions.CHARGE {
  const transactionType = statusBody.transactionType;
  return transactionType === "Sale" || transactionType === "Settle"
    ? PaymentTransactions.CHARGE
    : PaymentTransactions.AUTHORIZATION;
}

export function isPaymentTransaction(
  tx: NuveiDmnUpdateData["transactions"][number],
): boolean {
  return tx.type === PaymentTransactions.AUTHORIZATION || tx.type === PaymentTransactions.CHARGE;
}

export function dmnTerminalTransactionAlreadyRecorded(
  updateData: NuveiDmnUpdateData,
  payment: Payment,
): boolean {
  return updateData.transactions.some((tx) => {
    if (tx.state !== "Success" && tx.state !== "Failure") {
      return false;
    }

    if (!isPaymentTransaction(tx)) {
      return false;
    }

    if (!tx.interactionId) {
      // No PSP identity to compare → cannot match a recorded terminal transaction.
      return false;
    }

    return hasTerminalTransaction(payment, {
      type: tx.type,
      state: tx.state,
      interactionId: tx.interactionId,
    });
  });
}

export function dmnTerminalPaymentOutcome(
  updateData: NuveiDmnUpdateData,
): "approved" | "rejected" | undefined {
  const terminalPaymentTransaction = updateData.transactions.find(
    (tx) => isPaymentTransaction(tx) && (tx.state === "Success" || tx.state === "Failure"),
  );
  if (!terminalPaymentTransaction) return undefined;
  return terminalPaymentTransaction.state === "Success" ? "approved" : "rejected";
}

export function dmnHasNonTerminalPaymentTransaction(updateData: NuveiDmnUpdateData): boolean {
  return updateData.transactions.some(
    (tx) => isPaymentTransaction(tx) && tx.state !== "Success" && tx.state !== "Failure",
  );
}
