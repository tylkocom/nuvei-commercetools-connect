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
    const windowStub: { checkout?: typeof mockCheckout } = {};
    vi.stubGlobal("window", windowStub);

    let onLoad: (() => void) | undefined;
    const existingScript = {
      addEventListener: vi.fn((event: string, listener: () => void) => {
        if (event === "load") onLoad = listener;
      }),
    };
    const mockCreateElement = vi.fn();
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(existingScript),
      createElement: mockCreateElement,
      head: { appendChild: vi.fn() },
    });

    // Dynamic import is required here to exercise module-level loader caching.
    const { loadSimplyConnectSdk } = await import("../../src/services/simply-connect-sdk");
    const promise = loadSimplyConnectSdk();
    windowStub.checkout = mockCheckout;
    onLoad?.();
    const result = await promise;

    expect(result).toBe(mockCheckout);
    expect(existingScript.addEventListener).toHaveBeenCalledWith("load", expect.any(Function));
    expect(mockCreateElement).not.toHaveBeenCalled();
  });

  it("can retry after a failed script load", async () => {
    const mockCheckout = vi.fn();
    const windowStub: { checkout?: typeof mockCheckout } = {};
    vi.stubGlobal("window", windowStub);

    const scripts: Array<Record<string, any>> = [];
    const mockCreateElement = vi.fn(() => {
      const scriptEl = { remove: vi.fn() };
      scripts.push(scriptEl);
      return scriptEl;
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn().mockReturnValue(null),
      createElement: mockCreateElement,
      head: { appendChild: vi.fn() },
    });

    const { loadSimplyConnectSdk } = await import("../../src/services/simply-connect-sdk");
    const firstAttempt = loadSimplyConnectSdk();
    scripts[0].onerror();
    await expect(firstAttempt).rejects.toThrow("Failed to load Nuvei SDK script");

    const secondAttempt = loadSimplyConnectSdk();
    windowStub.checkout = mockCheckout;
    scripts[1].onload();

    await expect(secondAttempt).resolves.toBe(mockCheckout);
    expect(mockCreateElement).toHaveBeenCalledTimes(2);
    expect(scripts[0].remove).toHaveBeenCalledOnce();
  });

  it("fails and removes a newly appended script when loading times out", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("window", {});

      const scriptEl = { remove: vi.fn() };
      vi.stubGlobal("document", {
        querySelector: vi.fn().mockReturnValue(null),
        createElement: vi.fn().mockReturnValue(scriptEl),
        head: { appendChild: vi.fn() },
      });

      const { loadSimplyConnectSdk } = await import("../../src/services/simply-connect-sdk");
      const promise = loadSimplyConnectSdk();
      const assertion = expect(promise).rejects.toThrow("Timed out loading Nuvei SDK script");
      await vi.advanceTimersByTimeAsync(10_000);

      await assertion;
      expect(scriptEl.remove).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails and removes an existing script when its load event never resolves checkout", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("window", {});

      const existingScript = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        remove: vi.fn(),
      };
      vi.stubGlobal("document", {
        querySelector: vi.fn().mockReturnValue(existingScript),
        createElement: vi.fn(),
        head: { appendChild: vi.fn() },
      });

      const { loadSimplyConnectSdk } = await import("../../src/services/simply-connect-sdk");
      const promise = loadSimplyConnectSdk();
      const assertion = expect(promise).rejects.toThrow("Timed out loading Nuvei SDK script");
      await vi.advanceTimersByTimeAsync(10_000);

      await assertion;
      expect(existingScript.removeEventListener).toHaveBeenCalledWith("load", expect.any(Function));
      expect(existingScript.removeEventListener).toHaveBeenCalledWith("error", expect.any(Function));
      expect(existingScript.remove).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
