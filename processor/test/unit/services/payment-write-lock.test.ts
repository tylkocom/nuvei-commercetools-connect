import { describe, it, expect } from "vitest";
import { withPaymentWriteLock } from "../../../src/services/payment-write-lock";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withPaymentWriteLock", () => {
  it("runs work for the same payment one at a time, in arrival order", async () => {
    const events: string[] = [];

    const first = withPaymentWriteLock("payment-1", async () => {
      events.push("first:start");
      await delay(10);
      events.push("first:end");
    });
    const second = withPaymentWriteLock("payment-1", async () => {
      events.push("second:start");
      events.push("second:end");
    });

    await Promise.all([first, second]);

    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("does not block work for different payments", async () => {
    const events: string[] = [];

    const slow = withPaymentWriteLock("payment-1", async () => {
      await delay(20);
      events.push("payment-1");
    });
    const fast = withPaymentWriteLock("payment-2", async () => {
      events.push("payment-2");
    });

    await Promise.all([slow, fast]);

    expect(events).toEqual(["payment-2", "payment-1"]);
  });

  it("releases the lock when work throws so later writers still run", async () => {
    const failing = withPaymentWriteLock("payment-1", async () => {
      throw new Error("boom");
    });
    const following = withPaymentWriteLock("payment-1", async () => "ran");

    await expect(failing).rejects.toThrow("boom");
    await expect(following).resolves.toBe("ran");
  });

  it("returns the value produced by the work", async () => {
    await expect(withPaymentWriteLock("payment-1", async () => 42)).resolves.toBe(42);
  });
});
