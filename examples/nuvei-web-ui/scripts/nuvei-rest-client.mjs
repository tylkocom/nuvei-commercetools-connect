#!/usr/bin/env node
/**
 * Standalone signed Nuvei REST client for evidence collection.
 * Checksum field orders mirror processor/src/clients/nuvei.client.ts.
 * Never throws on gateway-level results — capturing them is the point.
 */
import { createHash, randomUUID } from 'node:crypto';

const CHECKSUM_FIELDS = {
  openOrder: ['merchantId', 'merchantSiteId', 'clientRequestId', 'amount', 'currency', 'timeStamp', 'secretKey'],
  payment: ['merchantId', 'merchantSiteId', 'clientRequestId', 'amount', 'currency', 'timeStamp', 'secretKey'],
  settleTransaction: ['merchantId', 'merchantSiteId', 'clientRequestId', 'clientUniqueId', 'amount', 'currency', 'relatedTransactionId', 'authCode', 'comment', 'urlDetails', 'timeStamp', 'secretKey'],
  voidTransaction: ['merchantId', 'merchantSiteId', 'clientRequestId', 'clientUniqueId', 'amount', 'currency', 'relatedTransactionId', 'authCode', 'comment', 'urlDetails', 'timeStamp', 'secretKey'],
  refundTransaction: ['merchantId', 'merchantSiteId', 'clientRequestId', 'clientUniqueId', 'amount', 'currency', 'relatedTransactionId', 'authCode', 'comment', 'urlDetails', 'timeStamp', 'secretKey'],
};

export const NUVEI_SANDBOX_BASE_URL = 'https://ppp-test.nuvei.com/ppp/api/v1';

// Official Nuvei sandbox test cards (docs.nuvei.com Testing Cards, non-3DS):
export const TEST_CARDS = {
  approvedVisa: { cardNumber: '4761344136141390', cardHolderName: 'Evidence Collector', expirationMonth: '12', expirationYear: '2030', CVV: '217' },
  declinedVisa: { cardNumber: '4107652651950141', cardHolderName: 'Evidence Collector', expirationMonth: '12', expirationYear: '2030', CVV: '217' },
};

function timeStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function checksumInputValue(payload, field, secretKey) {
  if (field === 'secretKey') return secretKey;
  const value = payload[field];
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function createNuveiClient({ merchantId, merchantSiteId, secretKey, baseUrl = NUVEI_SANDBOX_BASE_URL, timeoutMs = 20_000 }) {
  if (!secretKey) throw new Error('Nuvei secret key is required');
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '').endsWith('/api/v1')
    ? baseUrl.replace(/\/$/, '')
    : `${baseUrl.replace(/\/$/, '')}/api/v1`;

  async function send(endpoint, payload, { signed = true } = {}) {
    const requestPayload = { ...payload };
    if (signed) {
      requestPayload.merchantId = merchantId;
      requestPayload.merchantSiteId = merchantSiteId;
      requestPayload.clientRequestId = requestPayload.clientRequestId ?? randomUUID();
      requestPayload.timeStamp = timeStamp();
      const fields = CHECKSUM_FIELDS[endpoint];
      if (!fields) throw new Error(`No checksum field order for endpoint ${endpoint}`);
      const input = fields.map((field) => checksumInputValue(requestPayload, field, secretKey)).join('');
      requestPayload.checksum = createHash('sha256').update(input).digest('hex');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${normalizedBaseUrl}/${endpoint}.do`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });
      const body = await response.json();
      return { httpStatus: response.status, request: requestPayload, response: body };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    openOrder(params) {
      return send('openOrder', params);
    },
    /**
     * Server-to-server card payment using a sessionToken from openOrder —
     * the same gateway call the browser SDKs perform.
     */
    payment({ sessionToken, amount, currency, transactionType = 'Auth', card, clientUniqueId, urlDetails }) {
      return send('payment', {
        sessionToken,
        amount,
        currency,
        transactionType,
        ...(clientUniqueId ? { clientUniqueId } : {}),
        ...(urlDetails ? { urlDetails } : {}),
        paymentOption: { card },
        billingAddress: { country: 'US', email: 'evidence@example.com' },
        deviceDetails: { ipAddress: '127.0.0.1' },
      });
    },
    getPaymentStatus(sessionToken) {
      return send('getPaymentStatus', { sessionToken }, { signed: false });
    },
    settleTransaction(params) {
      return send('settleTransaction', params);
    },
    voidTransaction(params) {
      return send('voidTransaction', params);
    },
    refundTransaction(params) {
      return send('refundTransaction', params);
    },
  };
}

export function validateDmnChecksum(body, secretKey) {
  const input =
    secretKey +
    String(body.totalAmount ?? '') +
    String(body.currency ?? '') +
    String(body.responseTimeStamp ?? '') +
    String(body.PPP_TransactionID ?? body.PPP_TransactionId ?? body.ppp_TransactionID ?? '') +
    String(body.Status ?? body.status ?? '') +
    String(body.productId ?? '');
  const computed = createHash('sha256').update(input).digest('hex');
  const received = String(body.advanceResponseChecksum ?? body.responsechecksum ?? body.responseChecksum ?? '');
  return computed === received;
}
