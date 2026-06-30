import { describe, expect, it } from "vitest";
import type { Payment, Transaction as CtTransaction } from "@commercetools/platform-sdk";
import { PaymentTransactions } from "../../../src/dtos/operations/payment-intents.dto.js";
import {
  dmnHasNonTerminalPaymentTransaction,
  dmnTerminalPaymentOutcome,
  dmnTerminalTransactionAlreadyRecorded,
  getConfirmTerminalTransactionType,
  getExistingTerminalOutcome,
  hasTerminalTransaction,
  isPaymentTransaction,
  paymentHasInteraction,
  transactionMatchesPlannedAmount,
} from "../../../src/services/payment-state.js";
import type { NuveiDmnUpdateData } from "../../../src/services/converters/nuvei-event.converter.js";

type Tx = CtTransaction;

function tx(overrides: Partial<Tx> = {}): Tx {
  return {
    type: PaymentTransactions.AUTHORIZATION,
    state: "Success",
    amount: { centAmount: 1000, currencyCode: "USD" },
    interactionId: "ppp-1",
    ...overrides,
  } as Tx;
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    amountPlanned: { centAmount: 1000, currencyCode: "USD" },
    transactions: [],
    ...overrides,
  } as Payment;
}

/** SDK TransactionData and CT Transaction share the relevant shape; cast for the DMN helpers. */
function dmnUpdate(transactions: Tx[], pspReference = "ppp-1"): NuveiDmnUpdateData {
  return {
    id: "payment-1",
    pspReference,
    transactions: transactions as unknown as NuveiDmnUpdateData["transactions"],
  };
}

describe("payment-state", () => {
  describe("paymentHasInteraction", () => {
    it("matches the payment interfaceId", () => {
      expect(paymentHasInteraction(payment({ interfaceId: "session-1" }), "session-1")).toBe(true);
    });

    it("matches a transaction interactionId", () => {
      const p = payment({ transactions: [tx({ interactionId: "ppp-9" })] });
      expect(paymentHasInteraction(p, "ppp-9")).toBe(true);
    });

    it("returns false when no interaction matches", () => {
      expect(paymentHasInteraction(payment({ interfaceId: "session-1" }), "other")).toBe(false);
    });
  });

  describe("transactionMatchesPlannedAmount", () => {
    it("matches amount and currency", () => {
      expect(
        transactionMatchesPlannedAmount(
          payment({ amountPlanned: { centAmount: 1000, currencyCode: "USD" } }),
          tx({ amount: { centAmount: 1000, currencyCode: "USD" } }),
        ),
      ).toBe(true);
    });

    it("rejects a centAmount mismatch", () => {
      expect(
        transactionMatchesPlannedAmount(
          payment({ amountPlanned: { centAmount: 1000, currencyCode: "USD" } }),
          tx({ amount: { centAmount: 999, currencyCode: "USD" } }),
        ),
      ).toBe(false);
    });

    it("rejects a transaction without an amount", () => {
      expect(
        transactionMatchesPlannedAmount(payment(), tx({ amount: undefined })),
      ).toBe(false);
    });
  });

  describe("getExistingTerminalOutcome", () => {
    it("returns approved for a successful Authorization matching the planned amount", () => {
      const p = payment({ transactions: [tx({ type: PaymentTransactions.AUTHORIZATION, state: "Success" })] });
      expect(getExistingTerminalOutcome(p)).toBe("approved");
    });

    it("returns rejected for a failed Charge matching the planned amount", () => {
      const p = payment({ transactions: [tx({ type: PaymentTransactions.CHARGE, state: "Failure" })] });
      expect(getExistingTerminalOutcome(p)).toBe("rejected");
    });

    it("approved wins over rejected when both are present", () => {
      const p = payment({
        transactions: [
          tx({ type: PaymentTransactions.CHARGE, state: "Failure" }),
          tx({ type: PaymentTransactions.AUTHORIZATION, state: "Success", interactionId: "ppp-ok" }),
        ],
      });
      expect(getExistingTerminalOutcome(p)).toBe("approved");
    });

    it("ignores a terminal transaction whose amount does not match the planned amount", () => {
      const p = payment({
        amountPlanned: { centAmount: 1000, currencyCode: "USD" },
        transactions: [tx({ state: "Success", amount: { centAmount: 500, currencyCode: "USD" } })],
      });
      expect(getExistingTerminalOutcome(p)).toBeUndefined();
    });

    it("ignores non-payment transaction types (Refund / CancelAuthorization)", () => {
      const p = payment({
        transactions: [
          tx({ type: PaymentTransactions.REFUND, state: "Success" }),
          tx({ type: PaymentTransactions.CANCEL_AUTHORIZATION, state: "Failure" }),
        ],
      });
      expect(getExistingTerminalOutcome(p)).toBeUndefined();
    });

    it("returns undefined when there are no transactions", () => {
      expect(getExistingTerminalOutcome(payment())).toBeUndefined();
    });
  });

  describe("hasTerminalTransaction", () => {
    it("matches on type, state and interactionId", () => {
      const p = payment({
        transactions: [tx({ type: PaymentTransactions.AUTHORIZATION, state: "Success", interactionId: "ppp-1" })],
      });
      expect(hasTerminalTransaction(p, { type: "Authorization", state: "Success", interactionId: "ppp-1" })).toBe(true);
    });

    it("returns false when the interactionId differs", () => {
      const p = payment({ transactions: [tx({ state: "Success", interactionId: "ppp-other" })] });
      expect(hasTerminalTransaction(p, { type: "Authorization", state: "Success", interactionId: "ppp-1" })).toBe(false);
    });

    it("returns false when type or state differs", () => {
      const p = payment({
        transactions: [tx({ type: PaymentTransactions.AUTHORIZATION, state: "Success", interactionId: "ppp-1" })],
      });
      expect(hasTerminalTransaction(p, { type: "Charge", state: "Success", interactionId: "ppp-1" })).toBe(false);
      expect(hasTerminalTransaction(p, { type: "Authorization", state: "Failure", interactionId: "ppp-1" })).toBe(false);
    });
  });

  describe("getConfirmTerminalTransactionType", () => {
    it("maps Sale and Settle to Charge", () => {
      expect(getConfirmTerminalTransactionType({ transactionType: "Sale" })).toBe(PaymentTransactions.CHARGE);
      expect(getConfirmTerminalTransactionType({ transactionType: "Settle" })).toBe(PaymentTransactions.CHARGE);
    });

    it("defaults everything else to Authorization", () => {
      expect(getConfirmTerminalTransactionType({ transactionType: "Auth" })).toBe(PaymentTransactions.AUTHORIZATION);
      expect(getConfirmTerminalTransactionType({})).toBe(PaymentTransactions.AUTHORIZATION);
    });
  });

  describe("isPaymentTransaction", () => {
    it("returns true for Authorization and Charge", () => {
      expect(isPaymentTransaction(tx({ type: PaymentTransactions.AUTHORIZATION } as Tx))).toBe(true);
      expect(isPaymentTransaction(tx({ type: PaymentTransactions.CHARGE } as Tx))).toBe(true);
    });

    it("returns false for non-payment types", () => {
      expect(isPaymentTransaction(tx({ type: PaymentTransactions.REFUND } as Tx))).toBe(false);
    });
  });

  describe("dmnTerminalTransactionAlreadyRecorded", () => {
    it("is true when the terminal payment transaction is already on the Payment by interactionId", () => {
      const p = payment({ transactions: [tx({ type: PaymentTransactions.AUTHORIZATION, state: "Success", interactionId: "ppp-1" })] });
      expect(dmnTerminalTransactionAlreadyRecorded(dmnUpdate([tx({ interactionId: "ppp-1" })]), p)).toBe(true);
    });

    it("is false when the interactionId differs", () => {
      const p = payment({ transactions: [tx({ interactionId: "ppp-1" })] });
      expect(dmnTerminalTransactionAlreadyRecorded(dmnUpdate([tx({ interactionId: "ppp-2" })]), p)).toBe(false);
    });

    it("is false when the DMN transaction carries no interactionId (nothing to match)", () => {
      const p = payment({ transactions: [tx({ interactionId: "ppp-1" })] });
      expect(
        dmnTerminalTransactionAlreadyRecorded(dmnUpdate([tx({ interactionId: undefined, state: "Success" })]), p),
      ).toBe(false);
    });

    it("ignores non-terminal DMN transactions", () => {
      const p = payment();
      expect(dmnTerminalTransactionAlreadyRecorded(dmnUpdate([tx({ state: "Pending" })]), p)).toBe(false);
    });
  });

  describe("dmnTerminalPaymentOutcome", () => {
    it("returns approved for a Success payment transaction", () => {
      expect(dmnTerminalPaymentOutcome(dmnUpdate([tx({ state: "Success" })]))).toBe("approved");
    });

    it("returns rejected for a Failure payment transaction", () => {
      expect(dmnTerminalPaymentOutcome(dmnUpdate([tx({ state: "Failure" })]))).toBe("rejected");
    });

    it("returns undefined when only non-terminal or non-payment transactions exist", () => {
      expect(dmnTerminalPaymentOutcome(dmnUpdate([tx({ state: "Pending" })]))).toBeUndefined();
      expect(
        dmnTerminalPaymentOutcome(dmnUpdate([tx({ type: PaymentTransactions.REFUND, state: "Success" })])),
      ).toBeUndefined();
    });
  });

  describe("dmnHasNonTerminalPaymentTransaction", () => {
    it("is true for a Pending Authorization", () => {
      expect(dmnHasNonTerminalPaymentTransaction(dmnUpdate([tx({ state: "Pending" })]))).toBe(true);
    });

    it("is false when all payment transactions are terminal", () => {
      expect(dmnHasNonTerminalPaymentTransaction(dmnUpdate([tx({ state: "Success" })]))).toBe(false);
    });
  });
});
