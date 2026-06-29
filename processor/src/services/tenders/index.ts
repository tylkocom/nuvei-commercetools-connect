import { BlikTenderStrategy } from "./blik-tender.strategy.js";
import { CardTenderStrategy } from "./card-tender.strategy.js";
import type { NuveiTender, NuveiTenderStrategy } from "./tender-strategy.js";

export type {
  NuveiTender,
  NuveiIntegrationSurface,
  TenderCapabilities,
  TenderSessionContext,
  NuveiTenderStrategy,
} from "./tender-strategy.js";
export { CardTenderStrategy } from "./card-tender.strategy.js";
export { BlikTenderStrategy } from "./blik-tender.strategy.js";

/**
 * Every Nuvei tender maps to exactly one strategy. `Record<NuveiTender, …>`
 * makes the compiler enforce that adding a tender to the union also registers a
 * strategy here — a new payment method cannot be forgotten.
 */
const TENDER_STRATEGIES: Record<NuveiTender, NuveiTenderStrategy> = {
  card: new CardTenderStrategy(),
  blik: new BlikTenderStrategy(),
};

/**
 * Resolve the strategy for a Nuvei tender. Adding a payment method =
 * extend `NuveiTender`, implement `NuveiTenderStrategy`, and add one entry to
 * `TENDER_STRATEGIES`.
 */
export function getTenderStrategy(tender: NuveiTender): NuveiTenderStrategy {
  return TENDER_STRATEGIES[tender];
}
