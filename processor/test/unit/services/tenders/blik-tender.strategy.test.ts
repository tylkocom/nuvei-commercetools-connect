import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Cart } from "@commercetools/platform-sdk";
import { getConfig } from "../../../../src/config/config.js";
import {
  PaymentSetupError,
  PublicPaymentErrorCode,
} from "../../../../src/dtos/operations/payment-errors.dto.js";
import { BlikTenderStrategy } from "../../../../src/services/tenders/blik-tender.strategy.js";
import { CardTenderStrategy } from "../../../../src/services/tenders/card-tender.strategy.js";
import type { TenderSessionContext } from "../../../../src/services/tenders/tender-strategy.js";

vi.mock("../../../../src/config/config", () => ({
  getConfig: vi.fn(),
}));

const mockedGetConfig = vi.mocked(getConfig);

function cart(billingCountry?: string, shippingCountry?: string): Cart {
  return {
    billingAddress: billingCountry ? { country: billingCountry } : undefined,
    shippingAddress: shippingCountry ? { country: shippingCountry } : undefined,
  } as unknown as Cart;
}

function ctx(overrides: Partial<TenderSessionContext> = {}): TenderSessionContext {
  return {
    cart: cart("PL", "PL"),
    amountPlanned: { currencyCode: "PLN" },
    shopperDetails: {
      country: "PL",
      email: "shopper@example.pl",
      firstName: "Jan",
      lastName: "Kowalski",
    },
    surface: "web-sdk",
    ...overrides,
  };
}

function expectReject(fn: () => void, category: string, code = PublicPaymentErrorCode.REQUEST_MALFORMED): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(PaymentSetupError);
  expect((caught as PaymentSetupError).code).toBe(code);
  expect((caught as PaymentSetupError).diagnostics.category).toBe(category);
}

describe("tender strategies", () => {
  beforeEach(() => {
    // Default: BLIK enabled for Simply Connect so the surface gate does not
    // interfere with the currency/country/shopper tests unless overridden.
    mockedGetConfig.mockReturnValue({ simplyConnectPaymentMethod: "blik" });
  });

  describe("CardTenderStrategy", () => {
    const strategy = new CardTenderStrategy();

    it("supports capture and cancel and does not require a Charge for refund", () => {
      expect(strategy.supportedModifications).toEqual({
        capture: true,
        cancel: true,
        refundRequiresExistingCharge: false,
      });
    });

    it("has no session prerequisites", () => {
      expect(() => strategy.validateSessionPrerequisites(ctx())).not.toThrow();
    });
  });

  describe("BlikTenderStrategy", () => {
    const strategy = new BlikTenderStrategy();

    it("is sale-based: no capture/cancel and refund requires an existing Charge", () => {
      expect(strategy.supportedModifications).toEqual({
        capture: false,
        cancel: false,
        refundRequiresExistingCharge: true,
      });
    });

    it("passes for a valid Polish BLIK session on the web-sdk surface", () => {
      expect(() => strategy.validateSessionPrerequisites(ctx())).not.toThrow();
    });

    it("passes on the simply-connect surface when BLIK is configured", () => {
      mockedGetConfig.mockReturnValue({ simplyConnectPaymentMethod: "blik" });
      expect(() => strategy.validateSessionPrerequisites(ctx({ surface: "simply-connect" }))).not.toThrow();
    });

    it("rejects simply-connect BLIK when BLIK is not the configured method", () => {
      mockedGetConfig.mockReturnValue({ simplyConnectPaymentMethod: "card" });
      expectReject(
        () => strategy.validateSessionPrerequisites(ctx({ surface: "simply-connect" })),
        "blik_not_enabled",
        PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      );
    });

    it("rejects non-PLN currencies", () => {
      expectReject(
        () => strategy.validateSessionPrerequisites(ctx({ amountPlanned: { currencyCode: "USD" } })),
        "blik_currency_invalid",
      );
    });

    it("rejects when neither billing nor shipping country is present", () => {
      expectReject(
        () => strategy.validateSessionPrerequisites(ctx({ cart: cart(undefined, undefined) })),
        "blik_country_invalid",
      );
    });

    it("rejects a non-PL country", () => {
      expectReject(
        () => strategy.validateSessionPrerequisites(ctx({ cart: cart("DE", "PL") })),
        "blik_country_invalid",
      );
    });

    it("rejects when shopper identity is incomplete (missing email)", () => {
      expectReject(
        () =>
          strategy.validateSessionPrerequisites(
            ctx({ shopperDetails: { country: "PL", firstName: "Jan", lastName: "Kowalski" } }),
          ),
        "blik_shopper_identity_missing",
      );
    });

    it("rejects when shopper country is not PL", () => {
      expectReject(
        () =>
          strategy.validateSessionPrerequisites(
            ctx({
              shopperDetails: { country: "DE", email: "s@example.de", firstName: "A", lastName: "B" },
            }),
          ),
        "blik_shopper_identity_missing",
      );
    });
  });
});
