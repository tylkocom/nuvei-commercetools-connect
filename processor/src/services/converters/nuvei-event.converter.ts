import { TransactionData } from "@commercetools/connect-payments-sdk";
import {
  mapNuveiTransactionType,
  mapNuveiDmnTransactionState,
  getStatusInterfaceCode,
} from "../payment-converter.js";
import { scaleToCentAmount } from "../money.js";

export interface NuveiDmnUpdateData {
  id: string;
  pspReference: string;
  transactions: TransactionData[];
  paymentMethod?: string;
  paymentMethodName?: { en: string };
  interfaceCode?: string;
  totalCentAmount?: number;
}

function getRequiredString(body: Record<string, unknown>, key: string): string {
  const value = getOptionalString(body, key);
  if (!value) {
    throw new Error(`Missing required DMN field: ${key}`);
  }
  return value;
}

function getRequiredStringFromKeys(body: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = getOptionalString(body, key);
    if (value) {
      return value;
    }
  }
  throw new Error(`Missing required DMN field: ${keys.join(" or ")}`);
}

function getOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function parseCentAmount(amount: unknown, currencyCode: string): number {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Invalid totalAmount in DMN");
  }
  return scaleToCentAmount(parsedAmount, currencyCode);
}

function isBlikPaymentMethod(paymentMethod: string | undefined): boolean {
  return paymentMethod === "apmgw_BLIK";
}

export class NuveiEventConverter {
  /**
   * Converts a Nuvei DMN (Direct Merchant Notification) body into a structured
   * payment update payload compatible with CommercetoolsPaymentService.updatePayment().
   */
  public convertDmnToPaymentUpdate(
    body: Record<string, unknown>,
    plannedCentAmount?: number,
  ): NuveiDmnUpdateData {
    const paymentId = getRequiredString(body, "merchant_unique_id");
    // Canonical PPP identity for terminal interactionId and pspReference (D-13).
    // Preferred order: PPP_TransactionID → PPP_TransactionId → ppp_TransactionID.
    // Fiscal TransactionID/TransactionId is optional secondary evidence only.
    const pppTransactionId = getRequiredStringFromKeys(body, [
      "PPP_TransactionID",
      "PPP_TransactionId",
      "ppp_TransactionID",
    ]);
    const nuveiTransactionType = getRequiredString(body, "transactionType");
    const nuveiStatus = getRequiredString(body, "ppp_status");
    const fiscalStatus = getOptionalString(body, "Status") ?? getOptionalString(body, "status");
    const currency = getRequiredString(body, "currency");
    const totalCentAmount = parseCentAmount(body.totalAmount, currency);
    const transactionType = mapNuveiTransactionType(nuveiTransactionType);
    const transactionState = mapNuveiDmnTransactionState(nuveiStatus, fiscalStatus);

    const transaction: TransactionData = {
      type: transactionType,
      interactionId: pppTransactionId,
      amount: {
        centAmount: totalCentAmount,
        currencyCode: currency,
      },
      state: transactionState,
    };

    const interfaceCode = getStatusInterfaceCode(
      transactionType,
      transactionState,
      totalCentAmount,
      plannedCentAmount,
    );

    const paymentMethod = getOptionalString(body, "payment_method");
    const cardCompany = getOptionalString(body, "cardCompany");
    const cardType = getOptionalString(body, "cardType");
    const isBlik = isBlikPaymentMethod(paymentMethod);

    const mappedPaymentMethod = isBlik ? "blik" : cardCompany;
    const mappedPaymentMethodName = isBlik
      ? { en: "BLIK" }
      : cardType
        ? { en: cardType }
        : undefined;

    return {
      id: paymentId,
      pspReference: pppTransactionId,
      transactions: [transaction],
      ...(interfaceCode && { interfaceCode }),
      ...(mappedPaymentMethod && { paymentMethod: mappedPaymentMethod }),
      ...(mappedPaymentMethodName && { paymentMethodName: mappedPaymentMethodName }),
      totalCentAmount,
    };
  }
}
