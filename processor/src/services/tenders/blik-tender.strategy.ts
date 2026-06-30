import { getConfig } from "../../config/config.js";
import {
  PaymentSetupError,
  PublicPaymentErrorCode,
} from "../../dtos/operations/payment-errors.dto.js";
import type { NuveiTenderStrategy, TenderSessionContext } from "./tender-strategy.js";

/**
 * BLIK tender: sale-based flow (direct Charge, no Authorization). Supports
 * refund only, and only against an existing Charge.
 *
 * Session prerequisites enforce BLIK's PLN / Polish-market constraints and the
 * Simply Connect enablement gate.
 */
export class BlikTenderStrategy implements NuveiTenderStrategy {
  public readonly tender = "blik" as const;
  public readonly supportedModifications = {
    capture: false,
    cancel: false,
    refundRequiresExistingCharge: true,
  };

  public validateSessionPrerequisites(ctx: TenderSessionContext): void {
    // BLIK rendered through the Simply Connect drop-in requires the processor
    // to be explicitly configured for it.
    if (ctx.surface === "simply-connect" && getConfig().simplyConnectPaymentMethod !== "blik") {
      throw new PaymentSetupError(PublicPaymentErrorCode.METHOD_UNSUPPORTED, {
        category: "blik_not_enabled",
      });
    }

    if (ctx.amountPlanned.currencyCode !== "PLN") {
      throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: "blik_currency_invalid",
      });
    }

    const countries = [ctx.cart.billingAddress?.country, ctx.cart.shippingAddress?.country].filter(
      (country): country is string => typeof country === "string" && country.length > 0,
    );
    if (countries.length === 0 || countries.some((country) => country !== "PL")) {
      throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: "blik_country_invalid",
      });
    }

    if (
      ctx.shopperDetails?.country !== "PL" ||
      !ctx.shopperDetails.email ||
      !ctx.shopperDetails.firstName ||
      !ctx.shopperDetails.lastName
    ) {
      throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: "blik_shopper_identity_missing",
      });
    }
  }
}
