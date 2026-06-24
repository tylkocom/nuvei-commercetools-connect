import { afterEach, describe, expect, it, vi } from "vitest";

const BASE_ENV = {
  CTP_PROJECT_KEY: "payment-integration",
  CTP_CLIENT_ID: "local-client",
  CTP_CLIENT_SECRET: "local-secret",
  CTP_CHECKOUT_URL: "https://checkout.europe-west1.gcp.commercetools.com",
  CTP_JWKS_URL: "https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json",
  CTP_JWT_ISSUER: "https://mc-api.europe-west1.gcp.commercetools.com",
  NUVEI_MERCHANT_ID: "merchant-id",
  NUVEI_MERCHANT_SITE_ID: "merchant-site-id",
  NUVEI_SECRET_KEY: "secret-key",
  NUVEI_API_BASE_URL: "https://ppp-test.nuvei.com/ppp/api/v1",
};

async function loadConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("CTP_") || key.startsWith("NUVEI_") || key === "PHASE_02_STAGE_A_LOCAL_MOCK_CT" || key === "RETURN_URL" || key === "CORS_ALLOWED_ORIGINS") {
      delete process.env[key];
    }
  }
  Object.assign(process.env, env);
  return import("../../../src/config/config");
}

describe("validateConfig Stage A local mock CT exception", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("rejects local HTTP commercetools URLs by default", async () => {
    const { validateConfig } = await loadConfig({
      ...BASE_ENV,
      CTP_AUTH_URL: "http://localhost:8091",
      CTP_API_URL: "http://localhost:8091",
      CTP_SESSION_URL: "http://localhost:8091",
    });

    expect(() => validateConfig()).toThrow("CTP_AUTH_URL must use HTTPS");
  });

  it("allows only local CT URLs in explicit Stage A mock mode", async () => {
    const { validateConfig } = await loadConfig({
      ...BASE_ENV,
      PHASE_02_STAGE_A_LOCAL_MOCK_CT: "true",
      CTP_AUTH_URL: "http://localhost:8091",
      CTP_API_URL: "http://127.0.0.1:8091",
      CTP_SESSION_URL: "http://localhost:8091",
    });

    expect(() => validateConfig()).not.toThrow();
  });

  it("rejects non-local HTTP CT URLs even in Stage A mock mode", async () => {
    const { validateConfig } = await loadConfig({
      ...BASE_ENV,
      PHASE_02_STAGE_A_LOCAL_MOCK_CT: "true",
      CTP_AUTH_URL: "http://localhost:8091",
      CTP_API_URL: "http://example.com",
      CTP_SESSION_URL: "http://127.0.0.1:8091",
    });

    expect(() => validateConfig()).toThrow("CTP_API_URL must use HTTPS");
  });

  it("parses semicolon-separated CORS origins", async () => {
    const { config } = await loadConfig({
      ...BASE_ENV,
      CORS_ALLOWED_ORIGINS:
        "http://localhost:3000; https://shelfmarket-dev.public.cloud.oklyt.pl",
    });

    expect(config.corsAllowedOrigins).toEqual([
      "http://localhost:3000",
      "https://shelfmarket-dev.public.cloud.oklyt.pl",
    ]);
  });

});
