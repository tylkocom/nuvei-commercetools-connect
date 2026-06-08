export const RAW_WORKSPACE = '.planning/tmp/phase-02-raw/';
export const EVIDENCE_ROOT = '.planning/phases/02-nuvei-sandbox-evidence-and-checkout-validation/evidence/';

export const STAGES = [
  'stage-a-local-processor-mock-ct',
  'stage-b-local-browser-processor',
  'stage-c-local-browser-processor-dmn',
  'stage-d-real-commercetools-checkout',
];

export const FRONTEND_MODES = ['not-captured', 'simply-connect', 'web-sdk', 'checkout-hosted'];
export const ENVIRONMENTS = ['not-captured', 'local-mock-ct', 'nuvei-sandbox-local-mock-ct', 'real-commercetools-checkout', 'commercetools-sandbox-complete-checkout', 'commercetools-sandbox-payment-only'];

export const EVIDENCE_SCENARIOS = [
  { id: 'NUV-01-success-auth', requirements: ['NUV-01', 'NUV-06'], requiredStage: 'stage-c-local-browser-processor-dmn', fixtureNames: ['openOrder-response.json', 'browser-result.json', 'getPaymentStatus-response.json', 'dmn-auth.json', 'ct-payment-before.json', 'ct-payment-after-confirm.json', 'ct-payment-after-dmn.json', 'processor-log.ndjson'], frontendModes: ['not-captured', 'simply-connect', 'web-sdk'] },
  { id: 'NUV-02-decline-auth', requirements: ['NUV-02', 'NUV-06'], requiredStage: 'stage-c-local-browser-processor-dmn', fixtureNames: ['openOrder-response.json', 'browser-result.json', 'getPaymentStatus-response.json', 'dmn-decline.json', 'ct-payment-after-confirm.json', 'processor-log.ndjson'], frontendModes: ['not-captured', 'simply-connect', 'web-sdk'] },
  { id: 'NUV-03-3ds-frictionless', requirements: ['NUV-03', 'NUV-06'], requiredStage: 'stage-c-local-browser-processor-dmn', fixtureNames: ['openOrder-response.json', 'browser-result.json', 'getPaymentStatus-response.json', 'dmn-3ds-frictionless.json', 'ct-payment-after-dmn.json', 'processor-log.ndjson'], frontendModes: ['not-captured', 'simply-connect', 'web-sdk'] },
  { id: 'NUV-04-3ds-stepup-success', requirements: ['NUV-04', 'NUV-06'], requiredStage: 'stage-c-local-browser-processor-dmn', fixtureNames: ['openOrder-response.json', 'browser-result.json', 'getPaymentStatus-response.json', 'dmn-3ds-stepup-success.json', 'ct-payment-after-dmn.json', 'processor-log.ndjson'], frontendModes: ['not-captured', 'simply-connect', 'web-sdk'] },
  { id: 'NUV-04-3ds-stepup-failure-or-abandonment', requirements: ['NUV-04', 'NUV-06'], requiredStage: 'stage-c-local-browser-processor-dmn', fixtureNames: ['openOrder-response.json', 'browser-result.json', 'getPaymentStatus-response.json', 'dmn-3ds-stepup-failure.json', 'ct-payment-after-dmn.json', 'processor-log.ndjson'], frontendModes: ['not-captured', 'simply-connect', 'web-sdk'] },
  { id: 'NUV-05-capture', requirements: ['NUV-05', 'NUV-06'], requiredStage: 'stage-c-local-browser-processor-dmn', fixtureNames: ['payment-intent-capture-request.json', 'payment-intent-capture-response.json', 'nuvei-settle-response.json', 'dmn-capture.json', 'ct-payment-after-capture.json', 'processor-log.ndjson'], frontendModes: ['not-captured'] },
  { id: 'NUV-05-cancel-authorization', requirements: ['NUV-05', 'NUV-06'], requiredStage: 'stage-c-local-browser-processor-dmn', fixtureNames: ['payment-intent-cancel-request.json', 'payment-intent-cancel-response.json', 'nuvei-void-response.json', 'dmn-cancel.json', 'ct-payment-after-cancel.json', 'processor-log.ndjson'], frontendModes: ['not-captured'] },
  { id: 'NUV-05-refund', requirements: ['NUV-05', 'NUV-06'], requiredStage: 'stage-c-local-browser-processor-dmn', fixtureNames: ['payment-intent-refund-request.json', 'payment-intent-refund-response.json', 'nuvei-refund-response.json', 'dmn-refund.json', 'ct-payment-after-refund.json', 'processor-log.ndjson'], frontendModes: ['not-captured'] },
  { id: 'NUV-05-duplicate-dmn', requirements: ['NUV-05', 'NUV-06'], requiredStage: 'stage-c-local-browser-processor-dmn', fixtureNames: ['dmn-original.json', 'dmn-replay.json', 'processor-duplicate-response.json', 'ct-payment-after-duplicate.json', 'processor-log.ndjson'], frontendModes: ['not-captured'] },
  { id: 'NUV-05-mismatch', requirements: ['NUV-05', 'NUV-06'], requiredStage: 'stage-c-local-browser-processor-dmn', fixtureNames: ['dmn-mismatch-request.json', 'processor-mismatch-response.json', 'ct-payment-after-mismatch.json', 'processor-log.ndjson'], frontendModes: ['not-captured'] },
  { id: 'NUV-07-complete-checkout-success', requirements: ['NUV-07', 'NUV-06'], requiredStage: 'stage-d-real-commercetools-checkout', fixtureNames: ['checkout-ui-evidence.json', 'ct-cart-after-checkout.json', 'ct-payment-after-checkout.json', 'ct-order-after-checkout.json', 'processor-session-response.json', 'processor-confirm-response.json', 'nuvei-dashboard-transaction.json', 'dmn-auth.json'], frontendModes: ['not-captured', 'checkout-hosted', 'simply-connect', 'web-sdk'], requiresRealCommercetoolsCheckout: true },
  { id: 'NUV-08-payment-only-success', requirements: ['NUV-08', 'NUV-06'], requiredStage: 'stage-d-real-commercetools-checkout', fixtureNames: ['checkout-ui-evidence.json', 'ct-cart-after-payment-only.json', 'ct-payment-after-payment-only.json', 'processor-session-response.json', 'processor-confirm-response.json', 'nuvei-dashboard-transaction.json', 'dmn-auth.json'], frontendModes: ['not-captured', 'checkout-hosted', 'simply-connect', 'web-sdk'], requiresRealCommercetoolsCheckout: true }
];

export const SCENARIO_IDS = EVIDENCE_SCENARIOS.map((scenario) => scenario.id);
