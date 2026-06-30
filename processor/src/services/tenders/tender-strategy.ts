import type { Cart } from "@commercetools/platform-sdk";
import type { OpenOrderBillingAddress } from "../../clients/nuvei.client.js";

/**
 * The Nuvei processing tender — the axis that determines reconciliation,
 * transaction types, and supported operations. Distinct from the browser
 * `uiMethod` (card / blik / embedded): one tender can surface through several
 * UI methods (the `card` tender renders as both `card` and the `embedded`
 * Simply Connect drop-in).
 *
 * Add new tenders here and register a strategy in `./index.ts`.
 */
export type NuveiTender = "card" | "blik";

export type NuveiIntegrationSurface = "web-sdk" | "simply-connect";

/**
 * Context handed to a tender strategy when validating session prerequisites,
 * before `openOrder` is called.
 */
export type TenderSessionContext = {
  cart: Cart;
  amountPlanned: { currencyCode: string };
  shopperDetails?: OpenOrderBillingAddress;
  surface: NuveiIntegrationSurface;
};

/**
 * Payment modifications a tender supports. Auth-based tenders (card) support
 * capture and cancel against an Authorization; sale-based tenders (blik) settle
 * directly as a Charge and support neither.
 */
export type TenderCapabilities = {
  /** Supports capture against an existing Authorization. */
  capture: boolean;
  /** Supports cancel/void against an existing Authorization. */
  cancel: boolean;
  /**
   * Whether a refund requires an existing terminal Charge transaction on the
   * Payment before it is allowed. Auth-based tenders (card) refund against the
   * session/interface id; sale-based tenders (blik) settle directly as a Charge
   * and can only be refunded once that Charge exists.
   */
  refundRequiresExistingCharge: boolean;
};

/**
 * Per-tender behaviour seam. Each Nuvei tender centralises its session-time
 * validation and supported operations here, so adding a payment method is one
 * strategy class plus one registry entry — no scattered `if (tender === …)`
 * branches across the service.
 */
export interface NuveiTenderStrategy {
  readonly tender: NuveiTender;
  /** Validate tender-specific prerequisites before openOrder. No-op when none. */
  validateSessionPrerequisites(ctx: TenderSessionContext): void;
  /** Which payment modifications this tender supports. */
  readonly supportedModifications: TenderCapabilities;
}
