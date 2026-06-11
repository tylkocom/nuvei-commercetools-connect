import { execFileSync } from "node:child_process";

function resolveBuildCommit(): string {
  const envCommit = [
    process.env.GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.VCS_REF,
    process.env.COMMIT_SHA,
  ].find((value) => value && value.trim().length > 0);

  if (envCommit) {
    return envCommit.trim();
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export const config = {
  // Required by Payment SDK
  projectKey: process.env.CTP_PROJECT_KEY || "payment-integration",
  clientId: process.env.CTP_CLIENT_ID || "xxx",
  clientSecret: process.env.CTP_CLIENT_SECRET || "xxx",
  jwksUrl:
    process.env.CTP_JWKS_URL ||
    "https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json",
  jwtIssuer: process.env.CTP_JWT_ISSUER || "https://mc-api.europe-west1.gcp.commercetools.com",
  authUrl: process.env.CTP_AUTH_URL || "https://auth.europe-west1.gcp.commercetools.com",
  apiUrl: process.env.CTP_API_URL || "https://api.europe-west1.gcp.commercetools.com",
  sessionUrl: process.env.CTP_SESSION_URL || "https://session.europe-west1.gcp.commercetools.com/",
  checkoutUrl:
    process.env.CTP_CHECKOUT_URL || "https://checkout.europe-west1.gcp.commercetools.com",
  healthCheckTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || "5000"),

  // Required by logger
  loggerLevel: process.env.LOGGER_LEVEL || "info",

  // Nuvei provider config
  nuveiEnv: (process.env.NUVEI_ENV || "test") as "test" | "production",
  nuveiMerchantId: process.env.NUVEI_MERCHANT_ID || "",
  nuveiMerchantSiteId: process.env.NUVEI_MERCHANT_SITE_ID || "",
  nuveiSecretKey: process.env.NUVEI_SECRET_KEY || "",
  nuveiApiBaseUrl: process.env.NUVEI_API_BASE_URL || "",
  nuveiDmnChecksumAlgorithm: "sha256" as const,

  // Connector service config
  serviceUrl: process.env.CONNECT_SERVICE_URL || "",
  port: parseInt(process.env.PORT || "8080"),

  // Payment Providers config
  returnUrl: process.env.RETURN_URL || "",
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(/[;,]/)
    .map((origin) => origin.trim())
    .filter(Boolean),
  buildCommit: resolveBuildCommit(),
  phase02StageALocalMockCt: process.env.PHASE_02_STAGE_A_LOCAL_MOCK_CT === "true",
  // Phase-2 evidence collection: token-gated /evidence/captures route.
  // Empty (default) keeps the route absent and buffering off.
  evidenceCaptureToken: process.env.EVIDENCE_CAPTURE_TOKEN || "",
};

export const getConfig = () => {
  return config;
};

function isStageALocalCtUrl(key: string, url: URL): boolean {
  const allowedKeys = new Set(["CTP_AUTH_URL", "CTP_API_URL", "CTP_SESSION_URL"]);
  return (
    config.phase02StageALocalMockCt &&
    allowedKeys.has(key) &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

export function validateConfig(): void {
  const requiredValues = {
    CTP_PROJECT_KEY: config.projectKey,
    CTP_CLIENT_ID: config.clientId,
    CTP_CLIENT_SECRET: config.clientSecret,
    CTP_AUTH_URL: config.authUrl,
    CTP_API_URL: config.apiUrl,
    CTP_SESSION_URL: config.sessionUrl,
    CTP_CHECKOUT_URL: config.checkoutUrl,
    CTP_JWKS_URL: config.jwksUrl,
    CTP_JWT_ISSUER: config.jwtIssuer,
    NUVEI_MERCHANT_ID: config.nuveiMerchantId,
    NUVEI_MERCHANT_SITE_ID: config.nuveiMerchantSiteId,
    NUVEI_SECRET_KEY: config.nuveiSecretKey,
    NUVEI_API_BASE_URL: config.nuveiApiBaseUrl,
  };

  const missing = Object.entries(requiredValues)
    .filter(([, value]) => !value || value === "xxx")
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }

  if (
    process.env.NUVEI_DMN_CHECKSUM_ALGORITHM &&
    process.env.NUVEI_DMN_CHECKSUM_ALGORITHM !== "sha256"
  ) {
    throw new Error("NUVEI_DMN_CHECKSUM_ALGORITHM must be sha256");
  }

  const httpsUrls = {
    CTP_AUTH_URL: config.authUrl,
    CTP_API_URL: config.apiUrl,
    CTP_SESSION_URL: config.sessionUrl,
    CTP_CHECKOUT_URL: config.checkoutUrl,
    CTP_JWKS_URL: config.jwksUrl,
    CTP_JWT_ISSUER: config.jwtIssuer,
    NUVEI_API_BASE_URL: config.nuveiApiBaseUrl,
    ...(config.returnUrl ? { RETURN_URL: config.returnUrl } : {}),
  };

  for (const [key, value] of Object.entries(httpsUrls)) {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && !isStageALocalCtUrl(key, parsed)) {
      throw new Error(`${key} must use HTTPS`);
    }
  }
}
