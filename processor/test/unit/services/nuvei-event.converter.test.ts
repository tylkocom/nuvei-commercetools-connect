import { describe, expect, it } from "vitest";
import { NuveiEventConverter } from "../../../src/services/converters/nuvei-event.converter.js";

const baseDmn = {
  merchant_unique_id: "payment-1",
  PPP_TransactionID: "ppp-tx-1",   // canonical PPP identity (D-13); TransactionID is now optional
  transactionType: "Auth",
  ppp_status: "OK",
  currency: "USD",
  totalAmount: "10.00",
};

describe("NuveiEventConverter", () => {
  it("parses DMN amount using zero-decimal currency fraction digits", () => {
    const update = new NuveiEventConverter().convertDmnToPaymentUpdate({
      ...baseDmn,
      currency: "JPY",
      totalAmount: "1234",
    });

    expect(update.transactions[0].amount).toEqual({ centAmount: 1234, currencyCode: "JPY" });
    expect(update.totalCentAmount).toBe(1234);
  });

  it("parses DMN amount using three-decimal currency fraction digits", () => {
    const update = new NuveiEventConverter().convertDmnToPaymentUpdate({
      ...baseDmn,
      currency: "KWD",
      totalAmount: "12.345",
    });

    expect(update.transactions[0].amount).toEqual({ centAmount: 12345, currencyCode: "KWD" });
    expect(update.totalCentAmount).toBe(12345);
  });

  it("rejects unknown Nuvei transaction types", () => {
    expect(() =>
      new NuveiEventConverter().convertDmnToPaymentUpdate({
        ...baseDmn,
        transactionType: "UnexpectedType",
      }),
    ).toThrow("Unsupported Nuvei transactionType: UnexpectedType");
  });

  it("rejects empty transaction types", () => {
    expect(() =>
      new NuveiEventConverter().convertDmnToPaymentUpdate({
        ...baseDmn,
        transactionType: " ",
      }),
    ).toThrow("Missing required DMN field: transactionType");
  });

  it("rejects empty currencies", () => {
    expect(() =>
      new NuveiEventConverter().convertDmnToPaymentUpdate({
        ...baseDmn,
        currency: " ",
      }),
    ).toThrow("Missing required DMN field: currency");
  });

  it("rejects unsupported currencies", () => {
    expect(() =>
      new NuveiEventConverter().convertDmnToPaymentUpdate({
        ...baseDmn,
        currency: "UNKNOWN",
      }),
    ).toThrow("Unsupported currency in DMN: UNKNOWN");
  });

  it("rejects non-numeric totalAmount values", () => {
    expect(() =>
      new NuveiEventConverter().convertDmnToPaymentUpdate({
        ...baseDmn,
        totalAmount: "not-a-number",
      }),
    ).toThrow("Invalid totalAmount in DMN");
  });
});
