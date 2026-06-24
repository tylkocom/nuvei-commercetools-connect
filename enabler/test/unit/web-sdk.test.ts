import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/simply-connect-sdk", () => ({
  loadSimplyConnectSdk: vi.fn(),
}));

import * as scSdk from "../../src/services/simply-connect-sdk";
import type { SafeChargeCardField, SafeChargeInstance } from "../../src/services/web-sdk";

describe("loadWebSdk", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves with a SafeCharge instance when window.SafeCharge already exists", async () => {
    const mockInstance = { fields: vi.fn(), createPayment: vi.fn() };
    const safeCharge = vi.fn(() => mockInstance);
    vi.stubGlobal("window", { SafeCharge: safeCharge });
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: vi.fn(),
      head: { appendChild: vi.fn() },
    });

    const { loadWebSdk } = await import("../../src/services/web-sdk");
    const result = await loadWebSdk({
      env: "int",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });

    expect(result).toBe(mockInstance);
    expect(safeCharge).toHaveBeenCalledWith({
      env: "int",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });
  });

  it("deduplicates concurrent calls and injects the script only once", async () => {
    const scriptEl = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "load") {
          scriptEl.onload = handler;
        } else if (event === "error") {
          scriptEl.onerror = handler;
        }
      }),
    };

    const mockInstance = { fields: vi.fn(), createPayment: vi.fn() };
    const safeCharge = vi.fn(() => mockInstance);
    const createElement = vi.fn().mockReturnValue(scriptEl);
    vi.stubGlobal("window", { SafeCharge: undefined });
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement,
      head: { appendChild: vi.fn() },
    });

    const { loadWebSdk } = await import("../../src/services/web-sdk");
    const p1 = loadWebSdk({ env: "int", merchantId: "merchant-123", merchantSiteId: "site-456" });
    const p2 = loadWebSdk({ env: "int", merchantId: "merchant-123", merchantSiteId: "site-456" });

    expect(p1).toBe(p2);
    expect(createElement).toHaveBeenCalledTimes(1);

    vi.stubGlobal("window", { SafeCharge: safeCharge });
    scriptEl.onload?.();

    await expect(p1).resolves.toBe(mockInstance);
  });

  it("rejects when the script fails to load", async () => {
    const scriptEl = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "load") {
          scriptEl.onload = handler;
        } else if (event === "error") {
          scriptEl.onerror = handler;
        }
      }),
    };

    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: vi.fn().mockReturnValue(scriptEl),
      head: { appendChild: vi.fn() },
    });

    const { loadWebSdk } = await import("../../src/services/web-sdk");
    const promise = loadWebSdk({
      env: "int",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });

    scriptEl.onerror?.();

    await expect(promise).rejects.toThrow("Failed to load Nuvei Web SDK script");
  });

  it("rejects if the script loads but window.SafeCharge is missing", async () => {
    const scriptEl = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "load") {
          scriptEl.onload = handler;
        } else if (event === "error") {
          scriptEl.onerror = handler;
        }
      }),
    };

    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: vi.fn().mockReturnValue(scriptEl),
      head: { appendChild: vi.fn() },
    });

    const { loadWebSdk } = await import("../../src/services/web-sdk");
    const promise = loadWebSdk({
      env: "int",
      merchantId: "merchant-123",
      merchantSiteId: "site-456",
    });

    scriptEl.onload?.();

    await expect(promise).rejects.toThrow("Nuvei SafeCharge factory not found after script load");
  });

  it("does not call the Simply Connect loader", async () => {
    const mockInstance = { fields: vi.fn(), createPayment: vi.fn() };
    vi.stubGlobal("window", {
      SafeCharge: vi.fn(() => mockInstance),
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: vi.fn(),
      head: { appendChild: vi.fn() },
    });

    const { loadWebSdk } = await import("../../src/services/web-sdk");
    await loadWebSdk({ env: "int", merchantId: "merchant-123", merchantSiteId: "site-456" });

    expect(scSdk.loadSimplyConnectSdk).not.toHaveBeenCalled();
  });

  it("exports the safecharge.js URL", async () => {
    const { WEB_SDK_URL } = await import("../../src/services/web-sdk");
    expect(WEB_SDK_URL).toBe(
      "https://cdn.safecharge.com/safecharge_resources/v1/websdk/safecharge.js",
    );
  });

  it("types card and BLIK createPayment payloads with optional getApms", async () => {
    const cardField: SafeChargeCardField = { attach: vi.fn() };
    const instance: SafeChargeInstance = {
      fields: vi.fn().mockReturnValue({ create: vi.fn().mockReturnValue(cardField) }),
      createPayment: vi.fn(),
      getApms: vi.fn((_params, callback) =>
        callback({ paymentMethods: [{ paymentMethod: "apmgw_BLIK" }] }),
      ),
    };
    const callback = vi.fn();

    instance.createPayment(
      {
        sessionToken: "session-token",
        paymentOption: cardField,
      },
      callback,
    );
    instance.createPayment(
      {
        sessionToken: "session-token",
        paymentOption: {
          alternativePaymentMethod: {
            paymentMethod: "apmgw_BLIK",
            blik_code: "777777",
          },
        },
        savePM: false,
      },
      callback,
    );
    instance.getApms?.({ currencyCode: "PLN", countryCode: "PL" }, callback);

    const withoutGetApms: SafeChargeInstance = {
      fields: instance.fields,
      createPayment: instance.createPayment,
    };
    expect(withoutGetApms.getApms).toBeUndefined();
    expect(instance.createPayment).toHaveBeenCalledTimes(2);
    expect(instance.getApms).toHaveBeenCalledWith(
      { currencyCode: "PLN", countryCode: "PL" },
      callback,
    );
  });
});
