import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PaymentModificationStatus,
  type AmountSchemaDTO,
} from "../../../src/dtos/operations/payment-intents.dto";
import type { Payment } from "@commercetools/platform-sdk";
import type {
  CommercetoolsCartService,
  CommercetoolsOrderService,
  CommercetoolsPaymentService,
} from "@commercetools/connect-payments-sdk";

// ---------------------------------------------------------------------------
// Mock all external modules before importing the class under test.
// ---------------------------------------------------------------------------

const mockNuveiClientInstance = {
  settleTransaction: vi.fn(),
  voidTransaction: vi.fn(),
  refundTransaction: vi.fn(),
  openOrder: vi.fn(),
  getPaymentStatus: vi.fn(),
  isReachable: vi.fn(),
  validateDmnChecksum: vi.fn(),
};

vi.mock("../../../src/clients/nuvei.client", () => ({
  nuveiClient: () => mockNuveiClientInstance,
}));

vi.mock("../../../src/config/config", () => ({
  getConfig: () => ({
    nuveiEnv: "test",
    nuveiMerchantId: "merchant-123",
    nuveiMerchantSiteId: "site-456",
    nuveiSecretKey: "secret-key",
    nuveiApiBaseUrl: "https://sandbox.safecharge.com",
    nuveiDmnChecksumAlgorithm: "sha256",
    projectKey: "test-project",
    clientId: "client-id",
    clientSecret: "client-secret",
    authUrl: "https://auth.example.com",
    apiUrl: "https://api.example.com",
    sessionUrl: "https://session.example.com",
    checkoutUrl: "https://checkout.example.com",
    jwksUrl: "https://mc-api.example.com/.well-known/jwks.json",
    jwtIssuer: "https://mc-api.example.com",
    healthCheckTimeout: 5000,
    returnUrl: "https://example.com/return",
    buildCommit: "6cd68f6d3c2f0b0f0f4d0b0db1e7a1c2f3e4f5a6",
  }),
  config: {},
}));

vi.mock("../../../src/payment-sdk", () => ({
  appLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  paymentSDK: {},
}));

vi.mock("../../../src/libs/logger/index", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../../src/libs/fastify/context/context", () => ({
  getCartIdFromContext: () => "cart-123",
  getMerchantReturnUrlFromContext: () => "https://example.com/return",
}));

const mockHasTransactionInState = vi.fn();
const mockGetPayment = vi.fn();
const mockUpdatePayment = vi.fn();
const mockGetCart = vi.fn();
const mockGetPaymentAmount = vi.fn();
const mockHandleCtPaymentCreation = vi.fn().mockResolvedValue("payment-ref-1");

vi.mock("@commercetools/connect-payments-sdk", () => ({
  CommercetoolsCartService: class {
    getCart = mockGetCart;
    getPaymentAmount = mockGetPaymentAmount;
  },
  CommercetoolsOrderService: class {},
  CommercetoolsPaymentService: class {
    getPayment = mockGetPayment;
    updatePayment = mockUpdatePayment;
    hasTransactionInState = mockHasTransactionInState;
  },
  ErrorInvalidOperation: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ErrorInvalidOperation";
    }
  },
  healthCheckCommercetoolsPermissions: vi.fn(),
  statusHandler: vi.fn(),
}));

vi.mock("../../../src/services/ct-payment-creation.service", () => ({
  CtPaymentCreationService: class {
    handleCtPaymentCreation = mockHandleCtPaymentCreation;
  },
}));

vi.mock("../../../src/services/converters/nuvei-event.converter", () => ({
  NuveiEventConverter: class {
    convertDmnToPaymentUpdate = vi.fn().mockReturnValue({
      id: "payment-1",
      pspReference: "dmn-tx-1",
      transactions: [
        {
          type: "Charge",
          interactionId: "dmn-tx-1",
          amount: { centAmount: 1000, currencyCode: "USD" },
          state: "Success",
        },
      ],
      interfaceCode: "paid",
      paymentMethod: "Visa",
      paymentMethodName: { en: "Credit Card" },
    });
  },
}));

import { NuveiPaymentService } from "../../../src/services/nuvei-payment.service";
import { statusHandler } from "@commercetools/connect-payments-sdk";
import {
  PaymentSetupError,
  PublicPaymentErrorCode,
} from "../../../src/dtos/operations/payment-errors.dto";
import { log } from "../../../src/libs/logger/index";
import {
  PAYMENT_METHOD_REGISTRY,
  SUPPORTED_PAYMENT_METHODS,
  isSupportedPaymentMethod,
} from "../../../src/dtos/operations/payment-components.dto";

// ---------------------------------------------------------------------------
type StatusHandlerOptions = {
  checks: Array<() => Promise<unknown>>;
};

type StatusHandlerBody = {
  status: string;
  timestamp: string;
  version: string;
  checks: unknown[];
};

type MockedStatusHandler = {
  mockImplementation: (
    implementation: (opts: StatusHandlerOptions) => () => Promise<{ body: StatusHandlerBody }>,
  ) => void;
};

const mockedStatusHandler = statusHandler as unknown as MockedStatusHandler;

// Helpers
// ---------------------------------------------------------------------------

function makeMockPayment(overrides: Record<string, unknown> = {}): Payment {
  return {
    id: "payment-1",
    interfaceId: "nuvei-tx-100",
    amountPlanned: { centAmount: 1000, currencyCode: "USD" },
    transactions: [],
    ...overrides,
  } as unknown as Payment;
}

function createService() {
  const ctCartService = { getCart: mockGetCart, getPaymentAmount: mockGetPaymentAmount };
  const ctPaymentService = {
    getPayment: mockGetPayment,
    updatePayment: mockUpdatePayment,
    hasTransactionInState: mockHasTransactionInState,
  };
  const ctOrderService = {};

  mockGetCart.mockResolvedValue({
    id: "cart-123",
    totalPrice: { centAmount: 1000, currencyCode: "USD" },
    paymentInfo: { payments: [{ typeId: "payment", id: "payment-1" }] },
  });
  mockGetPaymentAmount.mockResolvedValue({ centAmount: 1000, currencyCode: "USD" });
  mockGetPayment.mockResolvedValue(makeMockPayment());
  mockUpdatePayment.mockResolvedValue(undefined);

  const service = new NuveiPaymentService({
    ctCartService: ctCartService as unknown as CommercetoolsCartService,
    ctPaymentService: ctPaymentService as unknown as CommercetoolsPaymentService,
    ctOrderService: ctOrderService as unknown as CommercetoolsOrderService,
  });

  return { service };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NuveiPaymentService", () => {
  beforeEach(() => {
    vi.mocked(log.warn).mockReset();
    vi.mocked(log.error).mockReset();
    vi.mocked(log.info).mockReset();
    mockNuveiClientInstance.settleTransaction.mockReset();
    mockNuveiClientInstance.voidTransaction.mockReset();
    mockNuveiClientInstance.refundTransaction.mockReset();
    mockNuveiClientInstance.openOrder.mockReset();
    mockNuveiClientInstance.getPaymentStatus.mockReset();
    mockNuveiClientInstance.isReachable.mockReset();
    mockNuveiClientInstance.validateDmnChecksum.mockReset();
    mockHasTransactionInState.mockReset();
    mockGetPayment.mockReset();
    mockUpdatePayment.mockReset();
    mockGetCart.mockReset();
    mockGetPaymentAmount.mockReset();
    mockHandleCtPaymentCreation.mockReset();
    mockHandleCtPaymentCreation.mockResolvedValue("payment-ref-1");
  });

  // -------------------------------------------------------------------------
  // config()
  // -------------------------------------------------------------------------
  describe("config()", () => {
    it("returns correct environment, merchantId, merchantSiteId", async () => {
      const { service } = createService();
      const result = await service.config();
      expect(result).toEqual({
        environment: "test",
        merchantId: "merchant-123",
        merchantSiteId: "site-456",
      });
    });
  });

  // -------------------------------------------------------------------------
  // status()
  // -------------------------------------------------------------------------
  describe("status()", () => {
    it("calls statusHandler and returns its body with Nuvei reachability UP", async () => {
      const { service } = createService();

      mockNuveiClientInstance.isReachable.mockResolvedValue(undefined);

      let capturedChecks: Array<() => Promise<unknown>> = [];

      mockedStatusHandler.mockImplementation((opts) => {
        capturedChecks = opts.checks;
        return async () => ({
          body: {
            status: "OK",
            timestamp: "2024-07-15T14:00:43.068Z",
            version: "1.0.0",
            checks: [
              { name: "CoCo Permissions", status: "UP" },
              { name: "Nuvei Status check", status: "UP", message: "Nuvei API is reachable" },
            ],
          },
        });
      });

      const result = await service.status();

      // Verify statusHandler was called with the right config
      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        }),
      );

      // Execute the Nuvei reachability check and verify it returns UP
      const nuveiCheck = capturedChecks[1] as () => Promise<{
        name: string;
        status: string;
        message: string;
      }>;
      const checkResult = await nuveiCheck();
      expect(checkResult.name).toBe("Nuvei Status check");
      expect(checkResult.status).toBe("UP");
      expect(mockNuveiClientInstance.isReachable).toHaveBeenCalled();

      expect(result.status).toBe("OK");
    });

    it("Nuvei reachability check returns DOWN when isReachable throws", async () => {
      const { service } = createService();

      mockNuveiClientInstance.isReachable.mockRejectedValue(new Error("Connection refused"));

      let capturedChecks: Array<() => Promise<unknown>> = [];

      mockedStatusHandler.mockImplementation((opts) => {
        capturedChecks = opts.checks;
        return async () => ({
          body: {
            status: "PARTIAL",
            timestamp: "2024-07-15T14:00:43.068Z",
            version: "1.0.0",
            checks: [
              { name: "CoCo Permissions", status: "UP" },
              {
                name: "Nuvei Status check",
                status: "DOWN",
                message: "Nuvei API is not reachable. Please check the logs for more details.",
                details: { error: "Connection refused" },
              },
            ],
          },
        });
      });

      await service.status();

      // Execute the Nuvei reachability check and verify it returns DOWN
      const nuveiCheck = capturedChecks[1] as () => Promise<{
        name: string;
        status: string;
        message: string;

        details?: { error: string };
      }>;
      const checkResult = await nuveiCheck();
      expect(checkResult.name).toBe("Nuvei Status check");
      expect(checkResult.status).toBe("DOWN");
      expect(checkResult.details?.error).toBe("Connection refused");
      expect(mockNuveiClientInstance.isReachable).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // health()
  // -------------------------------------------------------------------------
  describe("health()", () => {
    it("returns config check status together with the running commit", async () => {
      const { service } = createService();

      const result = await service.health();

      expect(result).toEqual({
        status: "ok",
        commit: "6cd68f6d3c2f0b0f0f4d0b0db1e7a1c2f3e4f5a6",
        checks: [
          { name: "CTP_PROJECT_KEY", status: "ok" },
          { name: "CTP_CLIENT_ID", status: "ok" },
          { name: "CTP_CLIENT_SECRET", status: "ok" },
          { name: "CTP_AUTH_URL", status: "ok" },
          { name: "CTP_API_URL", status: "ok" },
          { name: "CTP_SESSION_URL", status: "ok" },
          { name: "CTP_CHECKOUT_URL", status: "ok" },
          { name: "CTP_JWKS_URL", status: "ok" },
          { name: "CTP_JWT_ISSUER", status: "ok" },
          { name: "NUVEI_MERCHANT_ID", status: "ok" },
          { name: "NUVEI_MERCHANT_SITE_ID", status: "ok" },
          { name: "NUVEI_SECRET_KEY", status: "ok" },
          { name: "NUVEI_API_BASE_URL", status: "ok" },
        ],
      });
    });
  });

  describe("processor payment method registry", () => {
    it("accepts exactly card", () => {
      expect(SUPPORTED_PAYMENT_METHODS).toEqual(["card"]);
      expect(isSupportedPaymentMethod("embedded")).toBe(false);
      expect(isSupportedPaymentMethod("dropin")).toBe(false);
      expect(PAYMENT_METHOD_REGISTRY.find((entry) => entry.key === "card")).toMatchObject({
        kind: "component",
        advertisedType: "card",
        transitional: false,
        pspMetadata: {},
      });
    });
  });

  // -------------------------------------------------------------------------
  // getSupportedPaymentComponents()
  // -------------------------------------------------------------------------
  describe("getSupportedPaymentComponents()", () => {
    it("returns registry-derived card component and no dropins", async () => {
      const { service } = createService();
      const result = await service.getSupportedPaymentComponents();
      expect(result).toEqual({
        dropins: [],
        components: [{ type: "card" }],
        express: [],
      });
    });
  });

  // -------------------------------------------------------------------------
  // capturePayment()
  // -------------------------------------------------------------------------
  describe("capturePayment()", () => {
    it("calls settleTransaction and returns APPROVED", async () => {
      const { service } = createService();

      mockNuveiClientInstance.settleTransaction.mockResolvedValue({
        transactionId: "settle-tx-1",
        status: "SUCCESS",
        errCode: 0,
      });

      const result = await service.capturePayment({
        payment: makeMockPayment(),
        amount: { centAmount: 1000, currencyCode: "USD" },
      });

      expect(mockNuveiClientInstance.settleTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: "10.00",
          currency: "USD",
          relatedTransactionId: "nuvei-tx-100",
        }),
      );
      expect(result.outcome).toBe(PaymentModificationStatus.APPROVED);
      expect(result.pspReference).toBe("settle-tx-1");
    });

    it("uses the successful authorization transaction as relatedTransactionId", async () => {
      const { service } = createService();

      mockNuveiClientInstance.settleTransaction.mockResolvedValue({
        transactionId: "settle-tx-1",
        status: "SUCCESS",
        errCode: 0,
      });

      await service.capturePayment({
        payment: makeMockPayment({
          interfaceId: "session-token-1",
          transactions: [
            { type: "Authorization", state: "Initial", interactionId: "session-token-1" },
            { type: "Authorization", state: "Success", interactionId: "auth-tx-1" },
          ],
        }),
        amount: {
          centAmount: 1234,
          currencyCode: "KWD",
          fractionDigits: 3,
        } as unknown as AmountSchemaDTO,
      });

      expect(mockNuveiClientInstance.settleTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: "1.234",
          relatedTransactionId: "auth-tx-1",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancelPayment()
  // -------------------------------------------------------------------------
  describe("cancelPayment()", () => {
    it("calls voidTransaction and returns APPROVED", async () => {
      const { service } = createService();

      mockNuveiClientInstance.voidTransaction.mockResolvedValue({
        transactionId: "void-tx-1",
        status: "SUCCESS",
        errCode: 0,
      });

      const result = await service.cancelPayment({
        payment: makeMockPayment(),
      });

      expect(mockNuveiClientInstance.voidTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: "10.00",
          currency: "USD",
          relatedTransactionId: "nuvei-tx-100",
        }),
      );
      expect(result.outcome).toBe(PaymentModificationStatus.APPROVED);
      expect(result.pspReference).toBe("void-tx-1");
    });

    it("uses the successful authorization transaction as relatedTransactionId", async () => {
      const { service } = createService();

      mockNuveiClientInstance.voidTransaction.mockResolvedValue({
        transactionId: "void-tx-1",
        status: "SUCCESS",
        errCode: 0,
      });

      await service.cancelPayment({
        payment: makeMockPayment({
          interfaceId: "session-token-1",
          transactions: [
            { type: "Authorization", state: "Initial", interactionId: "session-token-1" },
            { type: "Authorization", state: "Success", interactionId: "auth-tx-1" },
          ],
        }),
      });

      expect(mockNuveiClientInstance.voidTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          relatedTransactionId: "auth-tx-1",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // refundPayment()
  // -------------------------------------------------------------------------
  describe("refundPayment()", () => {
    it("calls refundTransaction and returns RECEIVED", async () => {
      const { service } = createService();

      mockNuveiClientInstance.refundTransaction.mockResolvedValue({
        transactionId: "refund-tx-1",
        status: "SUCCESS",
        errCode: 0,
      });

      const result = await service.refundPayment({
        payment: makeMockPayment(),
        amount: { centAmount: 1000, currencyCode: "USD" },
      });

      expect(mockNuveiClientInstance.refundTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: "10.00",
          currency: "USD",
          relatedTransactionId: "nuvei-tx-100",
        }),
      );
      expect(result.outcome).toBe(PaymentModificationStatus.RECEIVED);
      expect(result.pspReference).toBe("refund-tx-1");
    });

    it("uses an explicit transactionId before payment.interfaceId", async () => {
      const { service } = createService();

      mockNuveiClientInstance.refundTransaction.mockResolvedValue({
        transactionId: "refund-tx-1",
        status: "SUCCESS",
        errCode: 0,
      });

      await service.refundPayment({
        payment: makeMockPayment({ interfaceId: "session-token-1" }),
        amount: { centAmount: 1000, currencyCode: "USD" },
        transactionId: "charge-tx-1",
      });

      expect(mockNuveiClientInstance.refundTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          relatedTransactionId: "charge-tx-1",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // createPaymentSession()
  // -------------------------------------------------------------------------
  describe("createPaymentSession()", () => {
    it("formats zero-decimal currencies without forcing cents", async () => {
      const { service } = createService();

      mockGetCart.mockResolvedValue({ id: "cart-1", version: 1 });
      mockGetPaymentAmount.mockResolvedValue({
        centAmount: 1000,
        currencyCode: "JPY",
        fractionDigits: 0,
      });
      mockNuveiClientInstance.openOrder.mockResolvedValue({ sessionToken: "session-token-1" });

      await service.createPaymentSession();

      expect(mockNuveiClientInstance.openOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: "1000",
          currency: "JPY",
        }),
      );
    });

    it("passes paymentMethod 'card' when paymentMethodOptions contains card", async () => {
      const { service } = createService();

      mockGetCart.mockResolvedValue({ id: "cart-1", version: 1 });
      mockGetPaymentAmount.mockResolvedValue({ centAmount: 1000, currencyCode: "USD" });
      mockNuveiClientInstance.openOrder.mockResolvedValue({ sessionToken: "st-card" });

      await service.createPaymentSession({ paymentMethodOptions: { card: {} } });

      expect(mockHandleCtPaymentCreation).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: "card",
        }),
      );
    });

    it("rejects unsupported payment method 'embedded' before Nuvei or commercetools side effects", async () => {
      const { service } = createService();

      await expect(
        service.createPaymentSession({ paymentMethodOptions: { embedded: {} } }),
      ).rejects.toMatchObject({
        code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
      });
    });

    it("passes paymentMethod 'card' when no options are provided", async () => {
      const { service } = createService();

      mockGetCart.mockResolvedValue({ id: "cart-1", version: 1 });
      mockGetPaymentAmount.mockResolvedValue({ centAmount: 1000, currencyCode: "USD" });
      mockNuveiClientInstance.openOrder.mockResolvedValue({ sessionToken: "st-default" });

      await service.createPaymentSession();

      expect(mockHandleCtPaymentCreation).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: "card",
        }),
      );
    });

    it.each(["paypal", "dropin", "wechatpay"])(
      "rejects unsupported payment method %s before Nuvei or commercetools side effects",
      async (unsupportedMethod) => {
        const { service } = createService();

        await expect(
          service.createPaymentSession({ paymentMethodOptions: { [unsupportedMethod]: {} } }),
        ).rejects.toMatchObject({
          code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
          message: "Payment method is not supported.",
          diagnostics: expect.objectContaining({
            category: "method_unsupported",
            requestedMethod: unsupportedMethod,
          }),
        });

        expect(mockGetCart).not.toHaveBeenCalled();
        expect(mockGetPaymentAmount).not.toHaveBeenCalled();
        expect(mockNuveiClientInstance.openOrder).not.toHaveBeenCalled();
        expect(mockHandleCtPaymentCreation).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["multiple method keys", { paymentMethodOptions: { card: {}, paypal: {} } }],
      ["no method keys", { paymentMethodOptions: {} }],
      ["empty method key", { paymentMethodOptions: { "": {} } }],
      ["non-object options", []],
      ["non-object paymentMethodOptions", { paymentMethodOptions: [] }],
      ["non-object method payload", { paymentMethodOptions: { card: null } }],
      ["non-empty method payload", { paymentMethodOptions: { card: { unexpected: true } } }],
    ])("rejects malformed %s before Nuvei or commercetools side effects", async (_, options) => {
      const { service } = createService();

      await expect(service.createPaymentSession(options)).rejects.toMatchObject({
        code: PublicPaymentErrorCode.REQUEST_MALFORMED,
      });

      expect(mockGetCart).not.toHaveBeenCalled();
      expect(mockGetPaymentAmount).not.toHaveBeenCalled();
      expect(mockNuveiClientInstance.openOrder).not.toHaveBeenCalled();
      expect(mockHandleCtPaymentCreation).not.toHaveBeenCalled();
    });

    it("emits redacted setup diagnostics without raw request payload", async () => {
      const { service } = createService();

      await expect(
        service.createPaymentSession({ paymentMethodOptions: { wechatpay: { token: "secret" } } }),
      ).rejects.toBeInstanceOf(PaymentSetupError);

      expect(log.warn).toHaveBeenCalledWith("Payment setup validation failed.", {
        route: "POST /payments/session",
        code: PublicPaymentErrorCode.METHOD_UNSUPPORTED,
        category: "method_unsupported",
        requestedMethod: "wechatpay",
      });
      expect(log.warn).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ paymentMethodOptions: expect.anything() }),
      );
    });

    it("returns cartId, sessionToken, paymentReference, and merchantReturnUrl", async () => {
      const { service } = createService();

      mockGetCart.mockResolvedValue({ id: "cart-1", version: 1 });
      mockGetPaymentAmount.mockResolvedValue({ centAmount: 1000, currencyCode: "USD" });
      mockNuveiClientInstance.openOrder.mockResolvedValue({ sessionToken: "session-token-xyz" });

      const result = await service.createPaymentSession();

      expect(result).toEqual({
        cartId: "cart-1",
        sessionToken: "session-token-xyz",
        paymentReference: "payment-ref-1",
        merchantReturnUrl: "https://example.com/return",
        amount: "10.00",
        currency: "USD",
      });
    });
  });

  // -------------------------------------------------------------------------
  // confirmPayment()
  // -------------------------------------------------------------------------
  describe("confirmPayment()", () => {
    it("returns pending for approved official-shaped status without PPP (legacy test updated for D-14)", async () => {
      const { service } = createService();

      // Official-shaped getPaymentStatus response: only fiscal transactionId, no PPP variants.
      // Without PPP, /confirm cannot safely write a canonical CT terminal record, so returns pending.
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "APPROVED",
        transactionId: "auth-tx-1",
        amount: "10.00",
        currency: "USD",
      });
      mockGetPayment.mockResolvedValue(makeMockPayment({ interfaceId: "session-token-1" }));

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "pending" });
      // Must NOT use fiscal transactionId as interactionId (D-13)
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });
  });
  // -------------------------------------------------------------------------
  // confirmPayment() – tri-state outcome and canonical PPP identity
  // These tests define the REQUIRED behavior per D-01 through D-18.
  // They FAIL against the current implementation (Task 1 RED).
  // -------------------------------------------------------------------------
  describe("confirmPayment() – tri-state outcome and canonical PPP identity", () => {
    it("existing successful Authorization for planned amount returns approved without Nuvei lookup", async () => {
      const { service } = createService();
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          interfaceId: "session-token-1",
          transactions: [
            {
              type: "Authorization",
              state: "Success",
              interactionId: "dmn-auth-success-1",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "approved" });
      expect(mockNuveiClientInstance.getPaymentStatus).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("existing successful Charge for planned amount returns approved without Nuvei lookup", async () => {
      const { service } = createService();
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          interfaceId: "session-token-1",
          transactions: [
            {
              type: "Charge",
              state: "Success",
              interactionId: "dmn-charge-success-1",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "approved" });
      expect(mockNuveiClientInstance.getPaymentStatus).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("existing failed Authorization for planned amount returns rejected without Nuvei lookup", async () => {
      const { service } = createService();
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          interfaceId: "session-token-1",
          transactions: [
            {
              type: "Authorization",
              state: "Failure",
              interactionId: "dmn-auth-failure-1",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "rejected" });
      expect(mockNuveiClientInstance.getPaymentStatus).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("approved official-shaped status without PPP remains pending when no CT terminal exists", async () => {
      const { service } = createService();
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          interfaceId: "session-token-1",
          transactions: [
            {
              type: "Authorization",
              state: "Initial",
              interactionId: "session-token-1",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "APPROVED",
        transactionId: "fiscal-tx-1",
        amount: "10.00",
        currency: "USD",
      });

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "pending" });
      expect(mockNuveiClientInstance.getPaymentStatus).toHaveBeenCalledWith({
        sessionToken: "session-token-1",
      });
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("returns { outcome: 'approved' } for SUCCESS+APPROVED with canonical PPP_TransactionID (D-01, D-15)", async () => {
      const { service } = createService();
      mockGetPayment.mockResolvedValue(makeMockPayment({ interfaceId: "session-token-1" }));
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "APPROVED",
        transactionId: "fiscal-tx-1",
        PPP_TransactionID: "ppp-tx-123",
        amount: "10.00",
        currency: "USD",
      });

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "approved" });
      // Must write Success Authorization using PPP as interactionId, not fiscal transactionId
      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({
            type: "Authorization",
            state: "Success",
            interactionId: "ppp-tx-123",
          }),
        }),
      );
      expect(mockUpdatePayment).not.toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({ interactionId: "fiscal-tx-1" }),
        }),
      );
      expect(mockUpdatePayment).not.toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({ interactionId: "session-token-1" }),
        }),
      );
    });

    it("approved official-shaped status without PPP returns { outcome: 'pending' } and does not call updatePayment (D-03, D-04, D-09, D-14)", async () => {
      const { service } = createService();
      mockGetPayment.mockResolvedValue(makeMockPayment({ interfaceId: "session-token-1" }));
      // Official-shaped getPaymentStatus: has transactionId but NO PPP_TransactionID variants
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "APPROVED",
        transactionId: "fiscal-tx-1",
        amount: "10.00",
        currency: "USD",
      });

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "pending" });
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("rejected (DECLINED) without PPP returns { outcome: 'rejected' } and does not write CT terminal (D-05, D-06, D-12, D-14, D-16)", async () => {
      const { service } = createService();
      mockGetPayment.mockResolvedValue(makeMockPayment({ interfaceId: "session-token-1" }));
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "DECLINED",
        transactionId: "fiscal-tx-1",
        amount: "10.00",
        currency: "USD",
      });

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "rejected" });
      // Must NOT write any CT terminal transaction (no sessionToken or fiscal ID fallback)
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("rejected (ERROR) without PPP returns { outcome: 'rejected' } and does not write CT terminal (D-16)", async () => {
      const { service } = createService();
      mockGetPayment.mockResolvedValue(makeMockPayment({ interfaceId: "session-token-1" }));
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "ERROR",
        transactionId: "fiscal-tx-1",
      });

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "rejected" });
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("rejected with PPP_TransactionID writes one Failure Authorization using PPP as interactionId (D-16)", async () => {
      const { service } = createService();
      mockGetPayment.mockResolvedValue(makeMockPayment({ interfaceId: "session-token-1" }));
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "DECLINED",
        PPP_TransactionID: "ppp-tx-rejected-456",
      });

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "rejected" });
      expect(mockUpdatePayment).toHaveBeenCalledTimes(1);
      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({
            type: "Authorization",
            state: "Failure",
            interactionId: "ppp-tx-rejected-456",
          }),
        }),
      );
      // Must NOT use sessionToken or fiscal ID as interactionId
      expect(mockUpdatePayment).not.toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({ interactionId: "session-token-1" }),
        }),
      );
    });

    it("duplicate rejected canonical PPP short-circuits without second updatePayment (D-16, D-18)", async () => {
      const { service } = createService();
      // Payment already has Failure Authorization with the same PPP interactionId
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          interfaceId: "session-token-1",
          transactions: [
            { type: "Authorization", state: "Failure", interactionId: "ppp-tx-rejected-456" },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "DECLINED",
        PPP_TransactionID: "ppp-tx-rejected-456",
      });

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "rejected" });
      // Must NOT append another Failure transaction
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("duplicate approved canonical PPP short-circuits without second updatePayment (D-15, D-18)", async () => {
      const { service } = createService();
      // Payment already has Success Authorization with the same PPP interactionId
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          interfaceId: "session-token-1",
          transactions: [{ type: "Authorization", state: "Success", interactionId: "ppp-tx-123" }],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "APPROVED",
        PPP_TransactionID: "ppp-tx-123",
        amount: "10.00",
        currency: "USD",
      });

      const result = await service.confirmPayment("payment-1", "session-token-1");

      expect(result).toEqual({ outcome: "approved" });
      // Must NOT append another transaction
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it.each([
      ["missing status and transactionStatus", { transactionId: "fiscal-tx" }],
      [
        "PENDING transactionStatus with SUCCESS",
        { status: "SUCCESS", transactionStatus: "PENDING" },
      ],
      ["UPDATE status", { status: "UPDATE", transactionStatus: "APPROVED" }],
      ["cashier ERROR status (not SUCCESS+DECLINED)", { status: "ERROR" }],
      [
        "unknown transactionStatus string",
        { status: "SUCCESS", transactionStatus: "UNKNOWN_FUTURE_VALUE" },
      ],
      ["null transactionStatus", { status: "SUCCESS", transactionStatus: null }],
    ])(
      "inconclusive/unknown Nuvei status (%s) returns { outcome: 'pending' } without CT write (D-03, D-08, D-09, D-17)",
      async (_, statusOverrides) => {
        const { service } = createService();
        mockGetPayment.mockResolvedValue(makeMockPayment({ interfaceId: "session-token-1" }));
        mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
          transactionId: "fiscal-tx-1",
          PPP_TransactionID: "ppp-tx-inconclusive",
          ...statusOverrides,
        });

        const result = await service.confirmPayment("payment-1", "session-token-1");

        expect(result).toEqual({ outcome: "pending" });
        expect(mockUpdatePayment).not.toHaveBeenCalled();
      },
    );

    it("session/cart mismatch throws a technical error and is not converted to a rejected outcome (D-06)", async () => {
      const { service } = createService();
      // Cart does NOT contain this payment
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        paymentInfo: { payments: [{ id: "other-payment-entirely" }] },
      });
      mockGetPayment.mockResolvedValue(makeMockPayment({ interfaceId: "session-token-1" }));

      // Must throw a technical error, not return an outcome
      await expect(service.confirmPayment("payment-1", "session-token-1")).rejects.toThrow(
        "Payment does not belong to authenticated cart session",
      );
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn() – canonical PPP identity (D-11 through D-13, D-18)
  // These tests define PPP-based dedup and identity behavior.
  // They FAIL against the current implementation (Task 1 RED).
  // -------------------------------------------------------------------------
  describe("processNuveiDmn() – canonical PPP identity", () => {
    it("deduplication uses PPP_TransactionID, not fiscal TransactionID (D-18)", async () => {
      const { service } = createService();
      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      // Payment has a transaction whose interactionId is the PPP value
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          interfaceId: "nuvei-tx-100",
          transactions: [
            { type: "Authorization", state: "Success", interactionId: "50001" }, // same as baseDmnFields PPP
          ],
        }),
      );

      const body: Record<string, unknown> = {
        merchant_unique_id: "payment-1",
        PPP_TransactionID: "50001", // canonical PPP – already present on payment
        TransactionID: "tx-auth-new-fiscal", // different fiscal TX – must NOT prevent dedup
        transactionType: "Auth",
        ppp_status: "OK",
        totalAmount: "10.00",
        currency: "USD",
      };

      await service.processNuveiDmn(body);

      // Must short-circuit because PPP already exists on payment
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("DMN with PPP_TransactionId (alt casing) is accepted for dedup (D-13)", async () => {
      const { service } = createService();
      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          interfaceId: "nuvei-tx-100",
          transactions: [{ type: "Authorization", state: "Success", interactionId: "60002" }],
        }),
      );

      const body: Record<string, unknown> = {
        merchant_unique_id: "payment-1",
        PPP_TransactionId: "60002", // alt casing: PPP_TransactionId
        transactionType: "Auth",
        ppp_status: "OK",
        totalAmount: "10.00",
        currency: "USD",
      };

      await service.processNuveiDmn(body);

      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("DMN with ppp_TransactionID (lowercase ppp) is accepted for dedup (D-13)", async () => {
      const { service } = createService();
      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          interfaceId: "nuvei-tx-100",
          transactions: [{ type: "Authorization", state: "Success", interactionId: "70003" }],
        }),
      );

      const body: Record<string, unknown> = {
        merchant_unique_id: "payment-1",
        ppp_TransactionID: "70003", // alt casing: ppp_TransactionID
        transactionType: "Auth",
        ppp_status: "OK",
        totalAmount: "10.00",
        currency: "USD",
      };

      await service.processNuveiDmn(body);

      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // reversePayment()
  // -------------------------------------------------------------------------
  describe("reversePayment()", () => {
    it("with Charge → calls refundPayment", async () => {
      const { service } = createService();

      mockHasTransactionInState
        .mockReturnValueOnce(true) // hasCharge = true
        .mockReturnValueOnce(false) // hasRefund = false
        .mockReturnValueOnce(false); // hasCancelAuthorization = false

      mockNuveiClientInstance.refundTransaction.mockResolvedValue({
        transactionId: "refund-tx-1",
        status: "SUCCESS",
        errCode: 0,
      });

      const result = await service.reversePayment({
        payment: makeMockPayment(),
        merchantReference: "ref-1",
      });

      expect(result.outcome).toBe(PaymentModificationStatus.RECEIVED);
    });

    it("with Authorization → calls cancelPayment", async () => {
      const { service } = createService();

      mockHasTransactionInState
        .mockReturnValueOnce(false) // hasCharge = false
        .mockReturnValueOnce(false) // hasRefund = false
        .mockReturnValueOnce(false) // hasCancelAuthorization = false
        .mockReturnValueOnce(true) // hasAuthorization = true
        .mockReturnValueOnce(false); // hasCancelAuthorization = false (re-check in wasPaymentReverted)

      mockNuveiClientInstance.voidTransaction.mockResolvedValue({
        transactionId: "void-tx-1",
        status: "SUCCESS",
        errCode: 0,
      });

      const result = await service.reversePayment({
        payment: makeMockPayment(),
        merchantReference: "ref-1",
      });

      expect(result.outcome).toBe(PaymentModificationStatus.APPROVED);
    });

    it("with neither Charge nor Authorization → throws ErrorInvalidOperation", async () => {
      const { service } = createService();

      mockHasTransactionInState.mockReturnValue(false);

      await expect(
        service.reversePayment({
          payment: makeMockPayment(),
          merchantReference: "ref-1",
        }),
      ).rejects.toThrow("There is no successful payment transaction to reverse.");
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn()
  // -------------------------------------------------------------------------
  describe("processNuveiDmn()", () => {
    it("with valid checksum adds transaction to CT payment", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          amountPlanned: { centAmount: 1000, currencyCode: "USD" },
          transactions: [],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "APPROVED",
        transactionId: "dmn-tx-1",
        sessionToken: "nuvei-tx-100",
        amount: "10.00",
        currency: "USD",
        clientUniqueId: "cart-123",
      });

      const body: Record<string, unknown> = {
        merchant_unique_id: "payment-1",
        clientUniqueId: "cart-123",
        TransactionID: "dmn-tx-1",
        totalAmount: "10.00",
        currency: "USD",
        transactionType: "Sale",
        ppp_status: "OK",
        Status: "APPROVED",
      };

      await service.processNuveiDmn(body);

      expect(mockGetPayment).toHaveBeenCalledWith({ id: "payment-1" });
      expect(mockUpdatePayment).toHaveBeenCalled();
    });

    it("rejects DMN when Nuvei payment status clientUniqueId does not match DMN body", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "APPROVED",
        transactionId: "dmn-tx-1",
        sessionToken: "nuvei-tx-100",
        amount: "10.00",
        currency: "USD",
        clientUniqueId: "cart-wrong", // does not match DMN body's clientUniqueId
      });

      const body: Record<string, unknown> = {
        merchant_unique_id: "payment-1",
        clientUniqueId: "cart-123", // correct cart ID
        TransactionID: "dmn-tx-1",
        totalAmount: "10.00",
        currency: "USD",
        transactionType: "Sale",
        ppp_status: "OK",
        Status: "APPROVED",
      };

      await expect(service.processNuveiDmn(body)).rejects.toThrow(
        "Nuvei payment status clientUniqueId does not match DMN",
      );
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("with duplicate canonical PPP interactionId skips update (PPP-based dedup, D-18)", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          transactions: [
            { interactionId: "ppp-existing-50001", type: "Authorization", state: "Success" },
          ],
        }),
      );

      const body: Record<string, unknown> = {
        merchant_unique_id: "payment-1",
        PPP_TransactionID: "ppp-existing-50001", // same PPP already on payment → dedup
        TransactionID: "tx-different-fiscal", // different fiscal TX – must not prevent dedup
        totalAmount: "10.00",
        currency: "USD",
        transactionType: "Sale",
        ppp_status: "OK",
      };

      await service.processNuveiDmn(body);

      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("with invalid checksum throws error", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(false);

      await expect(service.processNuveiDmn({})).rejects.toThrow("Invalid DMN checksum");
    });
  });
});
