import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentModificationStatus, type AmountSchemaDTO } from "../../../src/dtos/operations/payment-intents.dto";
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
    healthCheckTimeout: 5000,
    returnUrl: "https://example.com/return",
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
import { PaymentSetupError, PublicPaymentErrorCode } from "../../../src/dtos/operations/payment-errors.dto";
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
      const nuveiCheck = capturedChecks[1] as () => Promise<{ name: string; status: string; message: string }>;
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

  describe("processor payment method registry", () => {
    it("accepts exactly card and transitional embedded", () => {
      expect(SUPPORTED_PAYMENT_METHODS).toEqual(["card", "embedded"]);
      expect(isSupportedPaymentMethod("embedded")).toBe(true);
      expect(isSupportedPaymentMethod("dropin")).toBe(false);
      expect(PAYMENT_METHOD_REGISTRY.find((entry) => entry.key === "embedded")).toMatchObject({
        kind: "dropin",
        advertisedType: "embedded",
        transitional: true,
        pspMetadata: {},
      });
    });
  });

  // -------------------------------------------------------------------------
  // getSupportedPaymentComponents()
  // -------------------------------------------------------------------------
  describe("getSupportedPaymentComponents()", () => {
    it("returns registry-derived embedded dropin and card component", async () => {
      const { service } = createService();
      const result = await service.getSupportedPaymentComponents();
      expect(result).toEqual({
        dropins: [{ type: "embedded" }],
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
        amount: { centAmount: 1234, currencyCode: "KWD", fractionDigits: 3 } as unknown as AmountSchemaDTO,
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
  // createPaymentIntent()
  // -------------------------------------------------------------------------
  describe("createPaymentIntent()", () => {
    it("formats zero-decimal currencies without forcing cents", async () => {
      const { service } = createService();

      mockGetCart.mockResolvedValue({ id: "cart-1", version: 1 });
      mockGetPaymentAmount.mockResolvedValue({
        centAmount: 1000,
        currencyCode: "JPY",
        fractionDigits: 0,
      });
      mockNuveiClientInstance.openOrder.mockResolvedValue({ sessionToken: "session-token-1" });

      await service.createPaymentIntent();

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

      await service.createPaymentIntent({ paymentMethodOptions: { card: {} } });

      expect(mockHandleCtPaymentCreation).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: "card",
        }),
      );
    });

    it("passes paymentMethod 'embedded' when paymentMethodOptions contains embedded", async () => {
      const { service } = createService();

      mockGetCart.mockResolvedValue({ id: "cart-1", version: 1 });
      mockGetPaymentAmount.mockResolvedValue({ centAmount: 1000, currencyCode: "USD" });
      mockNuveiClientInstance.openOrder.mockResolvedValue({ sessionToken: "st-embedded" });

      await service.createPaymentIntent({ paymentMethodOptions: { embedded: {} } });

      expect(mockNuveiClientInstance.openOrder).toHaveBeenCalledOnce();
      expect(mockHandleCtPaymentCreation).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: "embedded",
        }),
      );
    });

    it("passes paymentMethod 'card' when no options are provided", async () => {
      const { service } = createService();

      mockGetCart.mockResolvedValue({ id: "cart-1", version: 1 });
      mockGetPaymentAmount.mockResolvedValue({ centAmount: 1000, currencyCode: "USD" });
      mockNuveiClientInstance.openOrder.mockResolvedValue({ sessionToken: "st-default" });

      await service.createPaymentIntent();

      expect(mockHandleCtPaymentCreation).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: "card",
        }),
      );
    });

    it("rejects unsupported payment methods before Nuvei or commercetools side effects", async () => {
      const { service } = createService();

      await expect(
        service.createPaymentIntent({ paymentMethodOptions: { wechatpay: { flow: "qrcode" } } }),
      ).rejects.toMatchObject({ code: PublicPaymentErrorCode.METHOD_UNSUPPORTED });

      expect(mockGetCart).not.toHaveBeenCalled();
      expect(mockGetPaymentAmount).not.toHaveBeenCalled();
      expect(mockNuveiClientInstance.openOrder).not.toHaveBeenCalled();
      expect(mockHandleCtPaymentCreation).not.toHaveBeenCalled();
    });

    it.each([
      ["multiple method keys", { paymentMethodOptions: { card: {}, embedded: {} } }],
      ["no method keys", { paymentMethodOptions: {} }],
      ["empty method key", { paymentMethodOptions: { "": {} } }],
      ["non-object options", []],
      ["non-object paymentMethodOptions", { paymentMethodOptions: [] }],
      ["non-object method payload", { paymentMethodOptions: { card: null } }],
      ["non-empty method payload", { paymentMethodOptions: { card: { unexpected: true } } }],
    ])("rejects malformed %s before Nuvei or commercetools side effects", async (_, options) => {
      const { service } = createService();

      await expect(service.createPaymentIntent(options)).rejects.toMatchObject({
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
        service.createPaymentIntent({ paymentMethodOptions: { wechatpay: { token: "secret" } } }),
      ).rejects.toBeInstanceOf(PaymentSetupError);

      expect(log.warn).toHaveBeenCalledWith("Payment setup validation failed.", {
        route: "POST /payments",
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

      const result = await service.createPaymentIntent();

      expect(result).toEqual({
        cartId: "cart-1",
        sessionToken: "session-token-xyz",
        paymentReference: "payment-ref-1",
        merchantReturnUrl: "https://example.com/return",
      });
    });
  });

  // -------------------------------------------------------------------------
  // confirmPayment()
  // -------------------------------------------------------------------------
  describe("confirmPayment()", () => {
    it("stores the Nuvei transactionId for approved payments", async () => {
      const { service } = createService();

      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "APPROVED",
        transactionId: "auth-tx-1",
        amount: "10.00",
        currency: "USD",
      });
      mockGetPayment.mockResolvedValue(makeMockPayment({ interfaceId: "session-token-1" }));

      await service.confirmPayment("payment-1", "session-token-1");

      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          pspReference: "auth-tx-1",
          transaction: expect.objectContaining({
            interactionId: "auth-tx-1",
          }),
        }),
      );
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

    it("rejects DMN when Nuvei status transaction does not match", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "SUCCESS",
        transactionStatus: "APPROVED",
        transactionId: "different-tx",
        sessionToken: "nuvei-tx-100",
        amount: "10.00",
        currency: "USD",
      });

      const body: Record<string, unknown> = {
        merchant_unique_id: "payment-1",
        TransactionID: "dmn-tx-1",
        totalAmount: "10.00",
        currency: "USD",
        transactionType: "Sale",
        ppp_status: "OK",
        Status: "APPROVED",
      };

      await expect(service.processNuveiDmn(body)).rejects.toThrow(
        "Nuvei payment status transaction does not match DMN",
      );
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("with duplicate transactionId skips update", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeMockPayment({
          transactions: [{ interactionId: "existing-tx-1", type: "Charge", state: "Success" }],
        }),
      );

      const body: Record<string, unknown> = {
        merchant_unique_id: "payment-1",
        TransactionID: "existing-tx-1",
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
