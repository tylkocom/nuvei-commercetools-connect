import type { NuveiTenderStrategy } from "./tender-strategy.js";

/**
 * Card tender: auth-based flow (Authorization → capture / cancel / refund).
 * No session-time prerequisites.
 */
export class CardTenderStrategy implements NuveiTenderStrategy {
  public readonly tender = "card" as const;
  public readonly supportedModifications = {
    capture: true,
    cancel: true,
    refundRequiresExistingCharge: false,
  };

  public validateSessionPrerequisites(): void {
    // Card has no tender-specific prerequisites.
  }
}
