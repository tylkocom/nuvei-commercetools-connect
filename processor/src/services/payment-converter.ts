import type { TransactionType, TransactionState } from "@commercetools/platform-sdk";

/**
 * Map Nuvei transaction types to commercetools TransactionTypes
 */
export function mapNuveiTransactionType(nuveiType: string): TransactionType {
  switch (nuveiType) {
    case "Auth":
    case "PreAuth":
      return "Authorization";
    case "Settle":
    case "Sale":
      return "Charge";
    case "Credit":
      return "Refund";
    case "Void":
      return "CancelAuthorization";
    case "Chargeback":
      return "Chargeback";
    default:
      throw new Error(`Unsupported Nuvei transactionType: ${nuveiType}`);
  }
}

/**
 * Map a Nuvei DMN to a commercetools TransactionState.
 *
 * `ppp_status` is the request-level status (OK / FAIL / PENDING) while the
 * optional `Status` field is the fiscal transaction result (APPROVED /
 * SUCCESS / DECLINED / ERROR / PENDING / UPDATE); both are covered by the
 * DMN checksum. A DMN maps to Success only when neither field contradicts
 * it — trusting ppp_status=OK alone would record a Success transaction for
 * a DECLINED fiscal result.
 */
export function mapNuveiDmnTransactionState(
  pppStatus: string,
  fiscalStatus?: string,
): TransactionState {
  if (pppStatus.toUpperCase() === "FAIL") {
    return "Failure";
  }

  switch (fiscalStatus?.toUpperCase()) {
    case "DECLINED":
    case "ERROR":
      return "Failure";
    case "PENDING":
    case "UPDATE":
      return "Pending";
    default:
      return pppStatus.toUpperCase() === "OK" ? "Success" : "Pending";
  }
}

/**
 * Derive paymentStatus.interfaceCode from transaction details
 */
export function getStatusInterfaceCode(
  transactionType: TransactionType,
  transactionState: TransactionState,
  totalCentAmount: number,
  plannedCentAmount?: number,
): string | undefined {
  if (transactionState === "Failure") {
    return "failed";
  }

  if (transactionState !== "Success" || totalCentAmount !== plannedCentAmount) {
    return undefined;
  }

  switch (transactionType) {
    case "Authorization":
      return "authorized";
    case "Charge":
      return "paid";
    case "Refund":
      return "refunded";
    case "CancelAuthorization":
      return "cancelled";
    default:
      return undefined;
  }
}
