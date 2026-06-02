import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("loadNuveiSdk", () => {
  beforeEach(() => {
    // Force a fresh module instance so the module-level sdkLoadPromise is reset
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---------------------------------------------------------------------------
  // Test: window.checkout already exists → resolves immediately
  // ---------------------------------------------------------------------------
  it("resolves immediately when window.checkout already exists", async () => {
    const mockCheckout = vi.fn();
    vi.stubGlobal("window", { checkout: mockCheckout });
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: vi.fn(),
      head: { appendChild: vi.fn() },
    });

    const { loadNuveiSdk } = await import("../../src/services/nuvei-sdk");
    const result = await loadNuveiSdk();

    expect(result).toBe(mockCheckout);
  });

  // ---------------------------------------------------------------------------
  // Test: concurrent calls return the same promise (deduplication)
  // ---------------------------------------------------------------------------
  it("returns the same promise for concurrent calls (deduplication)", async () => {
    vi.stubGlobal("window", {});

    const mockCreateElement = vi.fn().mockReturnValue({});
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: mockCreateElement,
      head: { appendChild: vi.fn() },
    });

    const { loadNuveiSdk } = await import("../../src/services/nuvei-sdk");

    const p1 = loadNuveiSdk();
    const p2 = loadNuveiSdk();

    expect(p1).toBe(p2);
    // Only one script element should be created even with two calls
    expect(mockCreateElement).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test: script load failure throws a clear error
  // ---------------------------------------------------------------------------
  it("throws a clear error when script fails to load", async () => {
    vi.stubGlobal("window", {});

    // The script object whose onerror handler loadNuveiSdk sets
    const scriptEl: Record<string, any> = {};
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: vi.fn().mockReturnValue(scriptEl),
      head: { appendChild: vi.fn() },
    });

    const { loadNuveiSdk } = await import("../../src/services/nuvei-sdk");
    const promise = loadNuveiSdk();

    // Trigger the onerror callback that loadNuveiSdk assigned to the script
    scriptEl.onerror();

    await expect(promise).rejects.toThrow("Failed to load Nuvei SDK script");
  });

  // ---------------------------------------------------------------------------
  // Test: existing script tag that has already loaded resolves correctly
  // ---------------------------------------------------------------------------
  it("resolves correctly when an existing script tag has already loaded", async () => {
    const mockCheckout = vi.fn();
    vi.stubGlobal("window", { checkout: mockCheckout });

    const mockCreateElement = vi.fn();
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue({ addEventListener: vi.fn() }),
      createElement: mockCreateElement,
      head: { appendChild: vi.fn() },
    });

    const { loadNuveiSdk } = await import("../../src/services/nuvei-sdk");
    const result = await loadNuveiSdk();

    expect(result).toBe(mockCheckout);
    // Should NOT create a new script element since the SDK is already loaded
    expect(mockCreateElement).not.toHaveBeenCalled();
  });
});
