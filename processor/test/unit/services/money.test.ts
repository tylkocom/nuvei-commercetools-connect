import { describe, expect, it } from "vitest";
import { getCurrencyFractionDigits } from "../../../src/services/money.js";

describe("money", () => {
  describe("getCurrencyFractionDigits", () => {
    it("returns 2 for USD/EUR/GBP and 0 for JPY", () => {
      expect(getCurrencyFractionDigits("USD")).toBe(2);
      expect(getCurrencyFractionDigits("EUR")).toBe(2);
      expect(getCurrencyFractionDigits("JPY")).toBe(0);
    });

    it("returns 3 for three-decimal currencies (BHD)", () => {
      expect(getCurrencyFractionDigits("BHD")).toBe(3);
    });

    it("returns a stable value across repeated calls (memoization)", () => {
      expect(getCurrencyFractionDigits("USD")).toBe(getCurrencyFractionDigits("USD"));
    });

    it("throws on an unsupported currency code", () => {
      expect(() => getCurrencyFractionDigits("UNKNOWN")).toThrow("Unsupported currency: UNKNOWN");
    });
  });
});
