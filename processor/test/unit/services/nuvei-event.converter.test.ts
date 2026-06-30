import { describe, expect, it } from "vitest";
import { NuveiEventConverter } from "../../../src/services/converters/nuvei-event.converter.js";

const baseDmn = {
  merchant_unique_id: "payment-1",
  PPP_TransactionID: "ppp-tx-1", // canonical PPP identity (D-13); TransactionID is now optional
  transactionType: "Auth",
  ppp_status: "OK",
  currency: "USD",
  totalAmount: "10.00",
};

describe("NuveiEventConverter", () => {
  it("converts a valid authorization DMN into a payment update", () => {
    const update = new NuveiEventConverter().convertDmnToPaymentUpdate(
      {
        ...baseDmn,
        cardCompany: "Visa",
        cardType: "Credit Card",
      },
      1000,
    );

    expect(update).toEqual({
      id: "payment-1",
      pspReference: "ppp-tx-1",
      transactions: [
        {
          type: "Authorization",
          interactionId: "ppp-tx-1",
          amount: { centAmount: 1000, currencyCode: "USD" },
          state: "Success",
        },
      ],
      interfaceCode: "authorized",
      paymentMethod: "Visa",
      paymentMethodName: { en: "Credit Card" },
      totalCentAmount: 1000,
    });
  });

  it("maps Nuvei BLIK DMNs to BLIK payment method metadata", () => {
    const update = new NuveiEventConverter().convertDmnToPaymentUpdate(
      {
        ...baseDmn,
        transactionType: "Sale",
        payment_method: "apmgw_BLIK",
        cardCompany: "ShouldNotWin",
        cardType: "Should not win",
      },
      1000,
    );

    expect(update.transactions[0].type).toBe("Charge");
    expect(update.paymentMethod).toBe("blik");
    expect(update.paymentMethodName).toEqual({ en: "BLIK" });
  });

  it("maps an approved fiscal status to Success", () => {
    const update = new NuveiEventConverter().convertDmnToPaymentUpdate({
      ...baseDmn,
      Status: "APPROVED",
    });

    expect(update.transactions[0].state).toBe("Success");
  });

  it("maps a declined fiscal status to Failure even when ppp_status is OK", () => {
    const update = new NuveiEventConverter().convertDmnToPaymentUpdate({
      ...baseDmn,
      Status: "DECLINED",
    });

    expect(update.transactions[0].state).toBe("Failure");
    expect(update.interfaceCode).toBe("failed");
  });

  it("maps an errored fiscal status to Failure even when ppp_status is OK", () => {
    const update = new NuveiEventConverter().convertDmnToPaymentUpdate({
      ...baseDmn,
      Status: "ERROR",
    });

    expect(update.transactions[0].state).toBe("Failure");
  });

  it("maps a pending fiscal status to Pending instead of trusting ppp_status", () => {
    const update = new NuveiEventConverter().convertDmnToPaymentUpdate({
      ...baseDmn,
      Status: "PENDING",
    });

    expect(update.transactions[0].state).toBe("Pending");
  });

  it("maps ppp_status FAIL to Failure regardless of fiscal status", () => {
    const update = new NuveiEventConverter().convertDmnToPaymentUpdate({
      ...baseDmn,
      ppp_status: "FAIL",
      Status: "APPROVED",
    });

    expect(update.transactions[0].state).toBe("Failure");
  });

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
    ).toThrow("Unsupported currency: UNKNOWN");
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
