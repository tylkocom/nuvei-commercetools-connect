import { readFile } from "node:fs/promises";

const REQUEST_TIMEOUT_MS = 10_000;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function safeDmnSummary(payload) {
  return {
    merchant_unique_id: String(payload.merchant_unique_id ?? ""),
    clientUniqueId: String(payload.clientUniqueId ?? ""),
    PPP_TransactionID: String(payload.PPP_TransactionID ?? payload.PPP_TransactionId ?? payload.ppp_TransactionID ?? ""),
    TransactionID: String(payload.TransactionID ?? payload.transactionId ?? ""),
    transactionType: String(payload.transactionType ?? ""),
    ppp_status: String(payload.ppp_status ?? ""),
    Status: String(payload.Status ?? payload.status ?? ""),
  };
}

function validateDmnFixture(payload) {
  const hasChecksum = Boolean(
    payload.advanceResponseChecksum ||
      payload.responseChecksum ||
      payload.responsechecksum ||
      payload.ResponseChecksum,
  );
  if (!hasChecksum) {
    throw new Error(
      "DMN fixture must include a checksum field (advanceResponseChecksum / responseChecksum).",
    );
  }
}

async function readJsonFile(path) {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DMN fixture must be a JSON object.");
  }
  return parsed;
}

async function assertEvidenceCapture(baseUrl, token, summary) {
  const response = await fetchWithTimeout(`${baseUrl}/evidence/captures`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status !== 200) {
    throw new Error(`Evidence capture check failed with status ${response.status}.`);
  }

  const body = await response.json();
  const entries = Array.isArray(body.entries) ? body.entries : [];
  const match = entries.find((entry) => {
    const request = entry?.request ?? {};
    return (
      entry?.route === "/webhooks/nuvei" &&
      String(request.merchant_unique_id ?? "") === summary.merchant_unique_id &&
      String(request.PPP_TransactionID ?? "") === summary.PPP_TransactionID
    );
  });

  if (!match) {
    throw new Error("Evidence capture did not contain the replayed DMN.");
  }
}

async function main() {
  const baseUrl = requiredEnv("PROCESSOR_BASE_URL").replace(/\/+$/, "");
  const fixturePath = requiredEnv("DMN_FIXTURE_FILE");
  const expectedStatus = Number(process.env.EXPECTED_STATUS ?? "200");
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) {
    throw new Error("EXPECTED_STATUS must be an HTTP status code.");
  }

  const payload = await readJsonFile(fixturePath);
  validateDmnFixture(payload);
  const summary = safeDmnSummary(payload);
  const response = await fetchWithTimeout(`${baseUrl}/webhooks/nuvei`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();

  if (response.status !== expectedStatus) {
    throw new Error(
      `DMN replay status mismatch: expected ${expectedStatus}, got ${response.status}. Body: ${body}`,
    );
  }

  const evidenceToken = process.env.EVIDENCE_CAPTURE_TOKEN?.trim();
  if (evidenceToken) {
    await assertEvidenceCapture(baseUrl, evidenceToken, summary);
  }

  console.log("DMN replay smoke passed", {
    baseUrl,
    status: response.status,
    summary,
    evidenceChecked: Boolean(evidenceToken),
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
