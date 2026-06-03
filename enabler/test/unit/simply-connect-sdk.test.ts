import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("loadSimplyConnectSdk", () => {
  beforeEach(() => {
    // Force a fresh module instance so the module-level scLoadPromise is reset.
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves immediately when window.checkout already exists", async () => {
    const mockCheckout = vi.fn();
    vi.stubGlobal("window", { checkout: mockCheckout });
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: vi.fn(),
      head: { appendChild: vi.fn() },
    });

    // Dynamic import is required here to exercise module-level loader caching.
    const { loadSimplyConnectSdk } = await import("../../src/services/simply-connect-sdk");
    const result = await loadSimplyConnectSdk();

    expect(result).toBe(mockCheckout);
  });

  it("returns the same promise for concurrent calls (deduplication)", async () => {
    vi.stubGlobal("window", {});

    const mockCreateElement = vi.fn().mockReturnValue({});
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: mockCreateElement,
      head: { appendChild: vi.fn() },
    });

    // Dynamic import is required here to exercise module-level loader caching.
    const { loadSimplyConnectSdk } = await import("../../src/services/simply-connect-sdk");

    const p1 = loadSimplyConnectSdk();
    const p2 = loadSimplyConnectSdk();

    expect(p1).toBe(p2);
    expect(mockCreateElement).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when script fails to load", async () => {
    vi.stubGlobal("window", {});

    const scriptEl: Record<string, any> = {};
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: vi.fn().mockReturnValue(scriptEl),
      head: { appendChild: vi.fn() },
    });

    // Dynamic import is required here to exercise module-level loader caching.
    const { loadSimplyConnectSdk } = await import("../../src/services/simply-connect-sdk");
    const promise = loadSimplyConnectSdk();

    scriptEl.onerror();

    await expect(promise).rejects.toThrow("Failed to load Nuvei SDK script");
  });

  it("resolves correctly when an existing script tag has already loaded", async () => {
    const mockCheckout = vi.fn();
    vi.stubGlobal("window", { checkout: mockCheckout });

    const mockCreateElement = vi.fn();
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue({ addEventListener: vi.fn() }),
      createElement: mockCreateElement,
      head: { appendChild: vi.fn() },
    });

    // Dynamic import is required here to exercise module-level loader caching.
    const { loadSimplyConnectSdk } = await import("../../src/services/simply-connect-sdk");
    const result = await loadSimplyConnectSdk();

    expect(result).toBe(mockCheckout);
    expect(mockCreateElement).not.toHaveBeenCalled();
  });
});
