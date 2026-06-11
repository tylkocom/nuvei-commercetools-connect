#!/usr/bin/env node
/**
 * Standalone commercetools REST client for evidence collection.
 * Client-credentials OAuth + thin JSON helpers. Returns { status, body }
 * without throwing on API errors — error bodies are evidence too.
 */

export function createCtClient({ projectKey, clientId, clientSecret, authUrl, apiUrl, timeoutMs = 15_000 }) {
  let accessToken;

  async function request(url, { method = 'GET', headers = {}, body } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { status: response.status, body: parsed };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function authenticate() {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const result = await request(`${authUrl.replace(/\/$/, '')}/oauth/token?grant_type=client_credentials`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}` },
    });
    if (result.status !== 200 || !result.body?.access_token) {
      throw new Error(`commercetools OAuth failed with status ${result.status}: ${JSON.stringify(result.body).slice(0, 300)}`);
    }
    accessToken = result.body.access_token;
    return result;
  }

  async function api(pathname, options = {}) {
    if (!accessToken) await authenticate();
    return request(`${apiUrl.replace(/\/$/, '')}/${projectKey}${pathname}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...options.headers, authorization: `Bearer ${accessToken}` },
    });
  }

  return { authenticate, api };
}
