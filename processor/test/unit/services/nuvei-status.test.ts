import { describe, expect, it } from "vitest";
import type { Payment } from "@commercetools/platform-sdk";
import {
  assertNuveiStatusMatchesPayment,
  classifyNuveiStatus,
  extractCanonicalPpp,
  extractNuveiTerminalIdentity,
  extractNuveiTransactionIdentities,
  formatAmount,
  parseAmountToCentAmount,
} from "../../../src/services/nuvei-status.js";

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    amountPlanned: { centAmount: 1000, currencyCode: "USD" },
    ...overrides,
  } as Payment;
}

describe("nuvei-status", () => {
  describe("classifyNuveiStatus", () => {
    it("classifies SUCCESS + APPROVED as approved", () => {
      expect(classifyNuveiStatus("SUCCESS", "APPROVED")).toBe("approved");
    });

    it("classifies SUCCESS + DECLINED/ERROR as rejected", () => {
      expect(classifyNuveiStatus("SUCCESS", "DECLINED")).toBe("rejected");
      expect(classifyNuveiStatus("SUCCESS", "ERROR")).toBe("rejected");
    });

    it("classifies PENDING and any non-approved SUCCESS state as pending", () => {
      expect(classifyNuveiStatus("SUCCESS", "PENDING")).toBe("pending");
      expect(classifyNuveiStatus("SUCCESS", "UPDATE")).toBe("pending");
    });

    it("classifies unknown/missing status as pending", () => {
      expect(classifyNuveiStatus(undefined, undefined)).toBe("pending");
      expect(classifyNuveiStatus("ERROR", "APPROVED")).toBe("pending");
    });

    it("is case-sensitive on status", () => {
      // "success" (lowercase) is not "SUCCESS" → pending, even with APPROVED.
      expect(classifyNuveiStatus("success", "APPROVED")).toBe("pending");
    });
  });

  describe("parseAmountToCentAmount", () => {
    it("parses USD decimal amounts to cents", () => {
      expect(parseAmountToCentAmount("10.00", "USD")).toBe(1000);
      expect(parseAmountToCentAmount("10.5", "USD")).toBe(1050);
    });

    it("parses zero-decimal currencies without scaling (JPY)", () => {
      expect(parseAmountToCentAmount("10", "JPY")).toBe(10);
      expect(parseAmountToCentAmount("10.00", "JPY")).toBe(10);
    });

    it("rounds to the currency's fraction digits", () => {
      // BHD has 3 digits → 1.2345 rounds to 1235 (1234.5 milli-units).
      expect(parseAmountToCentAmount("1.2345", "BHD")).toBe(1235);
    });

    it("throws on non-finite input", () => {
      expect(() => parseAmountToCentAmount("abc", "USD")).toThrow("Invalid Nuvei amount");
      expect(() => parseAmountToCentAmount(Number.NaN, "USD")).toThrow("Invalid Nuvei amount");
      expect(() => parseAmountToCentAmount(Number.POSITIVE_INFINITY, "USD")).toThrow("Invalid Nuvei amount");
    });

    it("accepts numeric input", () => {
      expect(parseAmountToCentAmount(10, "USD")).toBe(1000);
    });
  });

  describe("formatAmount", () => {
    it("formats cents to a currency string", () => {
      expect(formatAmount({ centAmount: 1000, currencyCode: "USD" })).toBe("10.00");
      expect(formatAmount({ centAmount: 1050, currencyCode: "USD" })).toBe("10.50");
    });

    it("formats zero-decimal currencies without a fraction", () => {
      expect(formatAmount({ centAmount: 10, currencyCode: "JPY" })).toBe("10");
    });

    it("honours an explicit fractionDigits override", () => {
      expect(formatAmount({ centAmount: 1000, currencyCode: "USD", fractionDigits: 0 })).toBe("1000");
    });
  });

  describe("extractCanonicalPpp", () => {
    it("prefers PPP_TransactionID", () => {
      expect(extractCanonicalPpp({ PPP_TransactionID: "ppp-1", PPP_TransactionId: "ppp-2" })).toBe("ppp-1");
    });

    it("falls back to PPP_TransactionId then ppp_TransactionID", () => {
      expect(extractCanonicalPpp({ PPP_TransactionId: "ppp-2" })).toBe("ppp-2");
      expect(extractCanonicalPpp({ ppp_TransactionID: "ppp-3" })).toBe("ppp-3");
    });

    it("returns undefined when no PPP key is present", () => {
      expect(extractCanonicalPpp({ TransactionID: "tx-1" })).toBeUndefined();
    });

    it("treats whitespace-only values as absent", () => {
      expect(extractCanonicalPpp({ PPP_TransactionID: "   " })).toBeUndefined();
    });
  });

  describe("extractNuveiTransactionIdentities", () => {
    it("collects PPP and fiscal ids, de-duplicating", () => {
      expect(
        extractNuveiTransactionIdentities({ PPP_TransactionID: "same", TransactionID: "same", transactionId: "fiscal" }),
      ).toEqual(["same", "fiscal"]);
    });

    it("returns an empty array when no identities are present", () => {
      expect(extractNuveiTransactionIdentities({})).toEqual([]);
    });
  });

  describe("extractNuveiTerminalIdentity", () => {
    it("uses PPP when present (source ppp)", () => {
      const id = extractNuveiTerminalIdentity({ PPP_TransactionID: "ppp-1" }, "session-1");
      expect(id).toEqual({ interactionId: "ppp-1", pspReference: "ppp-1", source: "ppp" });
    });

    it("falls back to fiscal transactionId (source transactionId)", () => {
      const id = extractNuveiTerminalIdentity({ TransactionID: "tx-1" }, "session-1");
      expect(id).toEqual({ interactionId: "tx-1", pspReference: "tx-1", source: "transactionId" });
    });

    it("falls back to the session token when no transaction id is present", () => {
      const id = extractNuveiTerminalIdentity({}, "session-1");
      expect(id).toEqual({ interactionId: "session-1", pspReference: "session-1", source: "sessionToken" });
    });
  });

  describe("assertNuveiStatusMatchesPayment", () => {
    it("passes when clientUniqueId matches the cart and amounts align", () => {
      expect(() =>
        assertNuveiStatusMatchesPayment(
          { clientUniqueId: "cart-1", amount: "10.00", currency: "USD" },
          payment(),
          "cart-1",
          true,
        ),
      ).not.toThrow();
    });

    it("throws when clientUniqueId does not match the cart", () => {
      expect(() =>
        assertNuveiStatusMatchesPayment({ clientUniqueId: "other" }, payment(), "cart-1"),
      ).toThrow("does not match cart");
    });

    it("ignores clientUniqueId when undefined", () => {
      expect(() =>
        assertNuveiStatusMatchesPayment({ amount: "10.00", currency: "USD" }, payment(), "cart-1", true),
      ).not.toThrow();
    });

    it("throws on a currency mismatch", () => {
      expect(() =>
        assertNuveiStatusMatchesPayment({ currency: "EUR" }, payment(), "cart-1"),
      ).toThrow("currency does not match");
    });

    it("throws on an amount mismatch", () => {
      expect(() =>
        assertNuveiStatusMatchesPayment({ amount: "9.99", currency: "USD" }, payment(), "cart-1"),
      ).toThrow("amount does not match");
    });

    it("requires currency and amount when requireFinancialFields is set", () => {
      expect(() =>
        assertNuveiStatusMatchesPayment({ clientUniqueId: "cart-1" }, payment(), "cart-1", true),
      ).toThrow("missing currency");
    });

    it("does not require financial fields when requireFinancialFields is false", () => {
      expect(() =>
        assertNuveiStatusMatchesPayment({ clientUniqueId: "cart-1" }, payment(), "cart-1", false),
      ).not.toThrow();
    });
  });
});
