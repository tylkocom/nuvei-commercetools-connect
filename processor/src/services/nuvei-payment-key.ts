/**
 * Deterministic commercetools Payment `key` derived from the Nuvei openOrder `orderId`.
 *
 * Nuvei echoes the openOrder `orderId` back on every DMN as `PPP_TransactionID`, so
 * a DMN can be mapped to its CT Payment with a single `GET /payments/key=...` call,
 * regardless of how many sibling Payments (card/BLIK mounts, retries) share the cart.
 *
 * CT keys must match `[A-Za-z0-9_-]{2,256}`; Nuvei order ids are numeric, so the
 * result is always valid.
 */
const KEY_PREFIX = "nuvei-";

export function nuveiPaymentKey(orderId: string | number): string {
  return `${KEY_PREFIX}${orderId}`;
}

/** Returns the key only when the Nuvei response actually carried a usable orderId. */
export function nuveiPaymentKeyFromOrder(orderId: unknown): string | undefined {
  if (typeof orderId === "number" && Number.isFinite(orderId)) return nuveiPaymentKey(orderId);
  if (typeof orderId === "string" && /^[0-9]+$/.test(orderId)) return nuveiPaymentKey(orderId);
  return undefined;
}
