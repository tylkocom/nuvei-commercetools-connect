import { describe, expect, it } from "vitest";
import {
  nuveiPaymentKey,
  nuveiPaymentKeyFromOrder,
} from "../../../src/services/nuvei-payment-key";

describe("nuvei payment key", () => {
  it("derives the key from a numeric or string order id", () => {
    expect(nuveiPaymentKey(4402057979221)).toBe("nuvei-4402057979221");
    expect(nuveiPaymentKeyFromOrder(4402057979221)).toBe("nuvei-4402057979221");
    expect(nuveiPaymentKeyFromOrder("4402057979221")).toBe("nuvei-4402057979221");
  });

  it("matches the CT key charset", () => {
    expect(nuveiPaymentKey(123)).toMatch(/^[A-Za-z0-9_-]{2,256}$/);
  });

  it.each([undefined, null, "", "abc", "12 3", "12;DROP", NaN, Infinity, {}])(
    "returns undefined for unusable order id %p",
    (value) => {
      expect(nuveiPaymentKeyFromOrder(value)).toBeUndefined();
    },
  );
});
