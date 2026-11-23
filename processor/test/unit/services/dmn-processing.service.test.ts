import { describe, it, expect, vi, beforeEach } from "vitest";

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
const mockFindPaymentsByInterfaceId = vi.fn();
const mockGetCart = vi.fn();
const mockGetPaymentAmount = vi.fn();

vi.mock("@commercetools/connect-payments-sdk", () => ({
  CommercetoolsCartService: class {
    getCart = mockGetCart;
    getPaymentAmount = mockGetPaymentAmount;
  },
  CommercetoolsOrderService: class {},
  CommercetoolsPaymentService: class {
    getPayment = mockGetPayment;
    updatePayment = mockUpdatePayment;
    findPaymentsByInterfaceId = mockFindPaymentsByInterfaceId;
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
    handleCtPaymentCreation = vi.fn().mockResolvedValue("payment-ref-1");
  },
}));

/**
 * We mock the converter but allow individual tests to override the return
 * value via mockImplementation so we can test every fixture type.
 */
const mockConvertDmnToPaymentUpdate = vi.fn();

vi.mock("../../../src/services/converters/nuvei-event.converter", () => ({
  NuveiEventConverter: class {
    convertDmnToPaymentUpdate = mockConvertDmnToPaymentUpdate;
  },
}));

import { NuveiPaymentService } from "../../../src/services/nuvei-payment.service";
import {
  dmnAuthOk,
  dmnAuthFail,
  dmnSettleOk,
  dmnCreditOk,
  dmnVoidOk,
  dmnDuplicateAuth,
  dmnMalformed,
  dmnMerchantMismatch,
  dmnCurrencyMismatch,
  dmnAmountMismatch,
  dmnMissingMerchantUniqueId,
  makeDmnMockPayment,
} from "../fixtures/dmn.fixtures";
import { PaymentTransactions } from "../../../src/dtos/operations/payment-intents.dto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-1",
    interfaceId: "nuvei-tx-100",
    amountPlanned: { centAmount: 1000, currencyCode: "USD" },
    transactions: [],
    ...overrides,
  } as any;
}

function createService(
  opts: {
    orderPaymentStateSync?: { syncWithRetry: ReturnType<typeof vi.fn> };
    ctPaymentClient?: unknown;
  } = {},
) {
  const ctCartService = { getCart: mockGetCart, getPaymentAmount: mockGetPaymentAmount };
  const ctPaymentService = {
    getPayment: mockGetPayment,
    updatePayment: mockUpdatePayment,
    findPaymentsByInterfaceId: mockFindPaymentsByInterfaceId,
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
  mockFindPaymentsByInterfaceId.mockResolvedValue([makeDmnMockPayment()]);
  mockUpdatePayment.mockResolvedValue(undefined);

  const ctCartClient = {
    carts: () => ({
      withId: () => ({
        get: () => ({ execute: vi.fn().mockResolvedValue({ body: { id: "cart-123", version: 2, cartState: "Frozen" } }) }),
        post: () => ({
          execute: vi.fn().mockResolvedValue({
            body: { id: "cart-123", version: 2, cartState: "Frozen" },
          }),
        }),
      }),
    }),
  };

  const service = new NuveiPaymentService({
    ctCartService: ctCartService as any,
    ctPaymentService: ctPaymentService as any,
    ctOrderService: ctOrderService as any,
    ctCartClient: ctCartClient as any,
    ...(opts.ctPaymentClient ? { ctPaymentClient: opts.ctPaymentClient as any } : {}),
    ...(opts.orderPaymentStateSync && { orderPaymentStateSync: opts.orderPaymentStateSync as any }),
  });

  return { service };
}

/** Builds a ctPaymentClient mock whose `payments().withKey({key}).get().execute()` is controllable. */
function makePaymentKeyClient(execute: ReturnType<typeof vi.fn>) {
  const withKey = vi.fn().mockReturnValue({ get: () => ({ execute }) });
  return { client: { payments: () => ({ withKey }) }, withKey, execute };
}

/**
 * Default converter output for a successful Auth DMN.
 * Individual tests override as needed.
 */
function defaultConverterReturn(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof mockConvertDmnToPaymentUpdate> {
  return {
    id: "payment-1",
    pspReference: "tx-auth-001",
    transactions: [
      {
        type: PaymentTransactions.AUTHORIZATION,
        interactionId: "tx-auth-001",
        amount: { centAmount: 1000, currencyCode: "USD" },
        state: "Success",
      },
    ],
    interfaceCode: "authorized",
    paymentMethod: "Visa",
    paymentMethodName: { en: "Credit Card" },
    ...overrides,
  };
}

function expectDmnUpdatePayloads(args: {
  pspReference: string;
  transaction: Record<string, unknown>;
  interfaceCode: string;
}) {
  // Terminal transaction and paymentMethodInfo are applied in one atomic updatePayment call.
  expect(mockUpdatePayment).toHaveBeenNthCalledWith(1, {
    id: "payment-1",
    pspReference: args.pspReference,
    transaction: args.transaction,
    paymentMethodInfo: { method: "Visa", name: { en: "Credit Card" } },
  });
  expect(mockConvertDmnToPaymentUpdate.mock.results[0]?.value).toEqual(
    expect.objectContaining({ interfaceCode: args.interfaceCode }),
  );
}

/**
 * Default Nuvei getPaymentStatus mock response that confirms the transaction.
 */
function defaultPaymentStatus(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof mockNuveiClientInstance.getPaymentStatus> {
  return {
    status: "SUCCESS",
    transactionStatus: "APPROVED",
    transactionId: "tx-auth-001",
    sessionToken: "nuvei-tx-100",
    amount: "10.00",
    currency: "USD",
    clientUniqueId: "cart-123",
    ...overrides,
  };
}

function setupSuccessfulStatusCheck(
  opts: {
    statusOverrides?: Record<string, unknown>;
    bodyOverrides?: Record<string, unknown>;
  } = {},
) {
  const { service } = createService();

  mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
  mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
  mockConvertDmnToPaymentUpdate.mockReturnValue(
    defaultConverterReturn({
      pspReference: "tx-auth-001",
      transactions: [
        {
          type: PaymentTransactions.AUTHORIZATION,
          interactionId: "tx-auth-001",
          amount: { centAmount: 1000, currencyCode: "USD" },
          state: "Success",
        },
      ],
    }),
  );
  mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
    defaultPaymentStatus({
      sessionToken: "nuvei-session-token",
      ...opts.statusOverrides,
    }),
  );

  return {
    service,
    body: {
      ...dmnAuthOk,
      ...opts.bodyOverrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NuveiPaymentService – DMN processing", () => {
  beforeEach(() => {
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
    mockFindPaymentsByInterfaceId.mockReset();
    mockGetCart.mockReset();
    mockGetPaymentAmount.mockReset();
    mockConvertDmnToPaymentUpdate.mockReset();
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – successful fixture types
  // -------------------------------------------------------------------------
  describe("successful DMN processing per fixture type", () => {
    it("processes successful authorization (Auth, OK)", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "tx-auth-001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
          interfaceCode: "authorized",
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(dmnAuthOk);

      expect(mockGetPayment).toHaveBeenCalledWith({ id: "payment-1" });
      expectDmnUpdatePayloads({
        pspReference: "tx-auth-001",
        transaction: {
          type: PaymentTransactions.AUTHORIZATION,
          interactionId: "tx-auth-001",
          amount: { centAmount: 1000, currencyCode: "USD" },
          state: "Success",
        },
        interfaceCode: "authorized",
      });
    });

    it("processes failed authorization (Auth, FAIL)", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({ interfaceId: "nuvei-session-token", transactions: [] }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "tx-auth-fail-001",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "tx-auth-fail-001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Failure",
            },
          ],
          interfaceCode: "failed",
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({
          sessionToken: "nuvei-session-token",
          transactionStatus: "DECLINED",
        }),
      );

      await service.processNuveiDmn(dmnAuthFail);

      expect(mockGetPayment).toHaveBeenCalledWith({ id: "payment-1" });
      expect(mockUpdatePayment).toHaveBeenCalled();
    });

    it("processes successful charge/settle (Settle, OK)", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "tx-settle-001",
          transactions: [
            {
              type: PaymentTransactions.CHARGE,
              interactionId: "tx-settle-001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
          interfaceCode: "paid",
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({
          transactionId: "tx-settle-001",
          sessionToken: "nuvei-session-token",
        }),
      );

      await service.processNuveiDmn(dmnSettleOk);

      expect(mockGetPayment).toHaveBeenCalledWith({ id: "payment-1" });
      expectDmnUpdatePayloads({
        pspReference: "tx-settle-001",
        transaction: {
          type: PaymentTransactions.CHARGE,
          interactionId: "tx-settle-001",
          amount: { centAmount: 1000, currencyCode: "USD" },
          state: "Success",
        },
        interfaceCode: "paid",
      });
    });

    it("processes successful refund (Credit, OK)", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({
          interfaceId: "nuvei-session-token",
          transactions: [
            {
              type: "Charge",
              state: "Success",
              interactionId: "tx-settle-001",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "tx-credit-001",
          transactions: [
            {
              type: PaymentTransactions.REFUND,
              interactionId: "tx-credit-001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
          interfaceCode: "refunded",
        }),
      );

      await service.processNuveiDmn(dmnCreditOk);

      expect(mockGetPayment).toHaveBeenCalledWith({ id: "payment-1" });
      expectDmnUpdatePayloads({
        pspReference: "tx-credit-001",
        transaction: {
          type: PaymentTransactions.REFUND,
          interactionId: "tx-credit-001",
          amount: { centAmount: 1000, currencyCode: "USD" },
          state: "Success",
        },
        interfaceCode: "refunded",
      });
    });

    it("processes successful void/cancel (Void, OK)", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({
          interfaceId: "nuvei-session-token",
          transactions: [
            {
              type: "Authorization",
              state: "Success",
              interactionId: "tx-auth-001",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "tx-void-001",
          transactions: [
            {
              type: PaymentTransactions.CANCEL_AUTHORIZATION,
              interactionId: "tx-void-001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
          interfaceCode: "cancelled",
        }),
      );

      await service.processNuveiDmn(dmnVoidOk);

      expect(mockGetPayment).toHaveBeenCalledWith({ id: "payment-1" });
      expectDmnUpdatePayloads({
        pspReference: "tx-void-001",
        transaction: {
          type: PaymentTransactions.CANCEL_AUTHORIZATION,
          interactionId: "tx-void-001",
          amount: { centAmount: 1000, currencyCode: "USD" },
          state: "Success",
        },
        interfaceCode: "cancelled",
      });
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – idempotency (duplicate DMNs)
  // -------------------------------------------------------------------------
  describe("duplicate DMN handling", () => {
    it("skips update when PPP_TransactionID already exists on payment (idempotent, D-18)", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({
          interfaceId: "nuvei-session-token",
          transactions: [
            {
              type: "Authorization",
              state: "Success",
              interactionId: "50001", // same as dmnDuplicateAuth's PPP_TransactionID (baseDmnFields default)
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "50001",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );

      await service.processNuveiDmn(dmnDuplicateAuth);

      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("skips update for exact duplicate DMN body (PPP dedup, D-18)", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({
          interfaceId: "nuvei-session-token",
          transactions: [
            {
              type: "Authorization",
              state: "Success",
              interactionId: "50001", // same PPP as dmnDuplicateAuth
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "50001",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );

      await service.processNuveiDmn(dmnDuplicateAuth);

      expect(mockUpdatePayment).not.toHaveBeenCalled();
      expect(mockConvertDmnToPaymentUpdate).not.toHaveBeenCalled();
    });

    it("skips Auth DMN when confirm already recorded terminal success with fallback transactionId", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({
          interfaceId: "nuvei-session-token",
          transactions: [
            {
              type: "Authorization",
              state: "Success",
              interactionId: "fiscal-tx-from-status",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "50001",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );

      await service.processNuveiDmn(dmnDuplicateAuth);

      expect(mockConvertDmnToPaymentUpdate).toHaveBeenCalled();
      expect(mockNuveiClientInstance.getPaymentStatus).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("allows an approved DMN to finalize a PPP that was previously recorded as pending", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({
          interfaceId: "nuvei-session-token",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              state: "Pending",
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "50001",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(dmnDuplicateAuth);

      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({ interactionId: "50001", state: "Success" }),
        }),
      );
    });

    it("does not append a rejected DMN after confirm already recorded terminal success with session-token identity", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({
          interfaceId: "nuvei-session-token",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              state: "Success",
              interactionId: "nuvei-session-token",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "50001",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Failure",
            },
          ],
          interfaceCode: "failed",
        }),
      );

      await expect(service.processNuveiDmn(dmnAuthFail)).resolves.toBeUndefined();

      expect(mockNuveiClientInstance.getPaymentStatus).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("rejects failed payment DMN when Nuvei status does not confirm the failure", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "50001",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Failure",
            },
          ],
          interfaceCode: "failed",
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await expect(service.processNuveiDmn(dmnAuthFail)).rejects.toThrow(
        "Nuvei payment status does not confirm failed DMN",
      );
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("processes failed payment DMN when Nuvei status confirms ERROR transactionStatus", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "50001",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Failure",
            },
          ],
          interfaceCode: "failed",
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({
          sessionToken: "nuvei-session-token",
          transactionStatus: "ERROR",
        }),
      );

      await service.processNuveiDmn(dmnAuthFail);

      expect(mockUpdatePayment).toHaveBeenCalled();
    });

    it("processes a terminal DMN when an existing non-terminal transaction has the same amount but different PPP", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({
          interfaceId: "nuvei-session-token",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              state: "Initial",
              interactionId: "old-ppp-001",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "new-ppp-002",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "new-ppp-002",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
          interfaceCode: "authorized",
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(dmnAuthOk);

      // Before the PPP-only fix, the amount fallback in hasTerminalTransaction
      // would match the existing Initial transaction (same amount + type) and
      // incorrectly skip the DMN. Now only PPP interactionId is compared.
      expect(mockUpdatePayment).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – invalid checksum
  // -------------------------------------------------------------------------
  describe("checksum validation", () => {
    it("rejects immediately when checksum is invalid", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(false);

      await expect(service.processNuveiDmn(dmnAuthOk)).rejects.toThrow("Invalid DMN checksum");

      expect(mockGetPayment).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – mismatched merchant ID
  // -------------------------------------------------------------------------
  describe("merchant ID validation", () => {
    it("rejects when merchant_id does not match config", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);

      await expect(service.processNuveiDmn(dmnMerchantMismatch)).rejects.toThrow(
        "DMN merchant_id does not match configured merchant",
      );

      expect(mockGetPayment).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – missing merchant_unique_id
  // -------------------------------------------------------------------------
  describe("merchant_unique_id validation", () => {
    it("rejects when merchant_unique_id is missing and no sessionToken fallback exists", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);

      await expect(service.processNuveiDmn(dmnMissingMerchantUniqueId)).rejects.toThrow(
        "Missing merchant_unique_id in DMN body",
      );

      expect(mockGetPayment).not.toHaveBeenCalled();
      expect(mockFindPaymentsByInterfaceId).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("falls back to sessionToken when merchant_unique_id is absent", async () => {
      const { service } = createService();
      const payment = makeDmnMockPayment({
        id: "payment-from-session",
        interfaceId: "nuvei-session-token",
      });
      const body = {
        ...dmnMissingMerchantUniqueId,
        sessionToken: "nuvei-session-token",
      };

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockFindPaymentsByInterfaceId.mockResolvedValue([payment]);
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(body);

      expect(mockGetPayment).not.toHaveBeenCalled();
      expect(mockFindPaymentsByInterfaceId).toHaveBeenCalledWith({
        interfaceId: "nuvei-session-token",
      });
      expect(mockConvertDmnToPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ merchant_unique_id: "payment-from-session" }),
        1000,
      );
      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: "payment-from-session" }),
      );
    });

    it("falls back to sessionToken when merchant_unique_id is not a CT Payment id", async () => {
      const { service } = createService();
      const payment = makeDmnMockPayment({
        id: "payment-from-session",
        interfaceId: "nuvei-session-token",
      });
      const body = {
        ...dmnAuthOk,
        merchant_unique_id: "nuvei-non-payment-reference",
        sessionToken: "nuvei-session-token",
      };

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      const notFound = Object.assign(
        new Error("Resource with ID 'nuvei-non-payment-reference' was not found"),
        { code: "ResourceNotFound", statusCode: 404 },
      );
      mockGetPayment.mockRejectedValue(notFound);
      mockGetCart.mockRejectedValue(notFound);
      mockFindPaymentsByInterfaceId.mockResolvedValue([payment]);
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(body);

      expect(mockFindPaymentsByInterfaceId).toHaveBeenCalledWith({
        interfaceId: "nuvei-session-token",
      });
      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: "payment-from-session" }),
      );
    });

    it("falls back to sessionToken when cart-id resolution only finds stale payment refs", async () => {
      const { service } = createService();
      const payment = makeDmnMockPayment({
        id: "payment-from-session",
        interfaceId: "nuvei-session-token",
      });
      const body = {
        ...dmnAuthOk,
        merchant_unique_id: "cart-123",
        sessionToken: "nuvei-session-token",
      };
      const notFound = Object.assign(new Error("Resource not found"), {
        code: "ResourceNotFound",
        statusCode: 404,
      });

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockRejectedValue(notFound);
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        version: 7,
        paymentInfo: { payments: [{ typeId: "payment", id: "stale-payment" }] },
      });
      mockFindPaymentsByInterfaceId.mockResolvedValue([payment]);
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(body);

      expect(mockGetCart).toHaveBeenCalledWith({ id: "cart-123" });
      expect(mockFindPaymentsByInterfaceId).toHaveBeenCalledWith({
        interfaceId: "nuvei-session-token",
      });
      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: "payment-from-session" }),
      );
    });

    it("does not fall back to sessionToken when merchant_unique_id lookup fails with non-404", async () => {
      const { service } = createService();
      const body = {
        ...dmnAuthOk,
        merchant_unique_id: "payment-1",
        sessionToken: "nuvei-session-token",
      };
      const apiError = new Error("commercetools unavailable");

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockRejectedValue(apiError);

      await expect(service.processNuveiDmn(body)).rejects.toThrow("commercetools unavailable");
      expect(mockFindPaymentsByInterfaceId).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("resolves method-updated drop-in payment by cart transaction identity", async () => {
      const { service } = createService();
      const payment = makeDmnMockPayment({
        id: "payment-from-cart",
        interfaceId: "nuvei-session-token",
        paymentMethodInfo: { paymentInterface: "checkout-session-interface", method: "Visa" },
        transactions: [
          {
            type: PaymentTransactions.AUTHORIZATION,
            state: "Initial",
            interactionId: "nuvei-session-token",
            amount: { centAmount: 1000, currencyCode: "USD" },
          },
          {
            type: PaymentTransactions.AUTHORIZATION,
            state: "Success",
            interactionId: "50001",
            amount: { centAmount: 1000, currencyCode: "USD" },
          },
        ],
      } as any);
      const body = {
        ...dmnAuthOk,
        merchant_unique_id: "cart-123",
      };

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        version: 7,
        paymentInfo: { payments: [{ typeId: "payment", id: "payment-from-cart" }] },
      });
      mockGetPayment.mockImplementation(async ({ id }: { id: string }) => {
        if (id === "cart-123") {
          throw new Error("The Resource with ID 'cart-123' was not found.");
        }
        if (id === "payment-from-cart") {
          return payment;
        }
        throw new Error(`Unexpected payment lookup: ${id}`);
      });
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await expect(service.processNuveiDmn(body)).resolves.toBeUndefined();

      expect(mockGetCart).toHaveBeenCalledWith({ id: "cart-123" });
      expect(mockFindPaymentsByInterfaceId).not.toHaveBeenCalled();
      expect(mockConvertDmnToPaymentUpdate).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("resolves method-updated drop-in payment by Nuvei session binding", async () => {
      const { service } = createService();
      const payment = makeDmnMockPayment({
        id: "payment-from-cart",
        interfaceId: "nuvei-session-token",
        paymentMethodInfo: { paymentInterface: "checkout-session-interface", method: "Visa" },
        transactions: [
          {
            type: PaymentTransactions.AUTHORIZATION,
            state: "Initial",
            interactionId: "nuvei-session-token",
            amount: { centAmount: 1000, currencyCode: "USD" },
          },
        ],
      } as any);
      const body = {
        ...dmnAuthOk,
        merchant_unique_id: "cart-123",
      };

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        version: 7,
        paymentInfo: { payments: [{ typeId: "payment", id: "payment-from-cart" }] },
      });
      mockGetPayment.mockImplementation(async ({ id }: { id: string }) => {
        if (id === "cart-123") {
          throw new Error("The Resource with ID 'cart-123' was not found.");
        }
        if (id === "payment-from-cart") {
          return payment;
        }
        throw new Error(`Unexpected payment lookup: ${id}`);
      });
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await expect(service.processNuveiDmn(body)).resolves.toBeUndefined();

      expect(mockConvertDmnToPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ merchant_unique_id: "payment-from-cart" }),
        1000,
      );
      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: "payment-from-cart" }),
      );
    });

    it("resolves BLIK cart-id DMNs before opaque sessionToken fallback", async () => {
      const { service } = createService();
      const payment = makeDmnMockPayment({
        id: "payment-from-cart",
        interfaceId: "nuvei-session-token",
        amountPlanned: { centAmount: 213700, currencyCode: "PLN" },
        paymentMethodInfo: { paymentInterface: "nuvei", method: "blik" },
        transactions: [
          {
            type: PaymentTransactions.CHARGE,
            state: "Initial",
            interactionId: "nuvei-session-token",
            amount: { centAmount: 213700, currencyCode: "PLN" },
          },
        ],
      } as any);
      const body = {
        ...dmnAuthOk,
        merchant_unique_id: "cart-123",
        clientUniqueId: "cart-123",
        sessionToken: "opaque-dmn-session-token",
        TransactionID: "8110000000033309521",
        PPP_TransactionID: "18773420111",
        transactionType: "Sale",
        ppp_status: "OK",
        Status: "APPROVED",
        totalAmount: "2137.00",
        currency: "PLN",
      };

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        version: 7,
        paymentInfo: { payments: [{ typeId: "payment", id: "payment-from-cart" }] },
      });
      mockGetPayment.mockImplementation(async ({ id }: { id: string }) => {
        if (id === "cart-123") {
          throw Object.assign(new Error("Resource with ID 'cart-123' was not found"), {
            code: "ResourceNotFound",
            statusCode: 404,
          });
        }
        if (id === "payment-from-cart") {
          return payment;
        }
        throw new Error(`Unexpected payment lookup: ${id}`);
      });
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "18773420111",
          transactions: [
            {
              type: PaymentTransactions.CHARGE,
              interactionId: "18773420111",
              amount: { centAmount: 213700, currencyCode: "PLN" },
              state: "Success",
            },
          ],
          interfaceCode: "paid",
          paymentMethod: "blik",
          paymentMethodName: { en: "BLIK" },
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({
          sessionToken: undefined,
          transactionId: "8110000000033309521",
          amount: "2137.00",
          currency: "PLN",
          clientUniqueId: "cart-123",
          transactionType: "Sale",
        }),
      );

      await expect(service.processNuveiDmn(body)).resolves.toBeUndefined();

      expect(mockFindPaymentsByInterfaceId).not.toHaveBeenCalled();
      expect(mockConvertDmnToPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ merchant_unique_id: "payment-from-cart" }),
        213700,
      );
      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "payment-from-cart",
          transaction: expect.objectContaining({
            type: PaymentTransactions.CHARGE,
            state: "Success",
          }),
        }),
      );
    });

    it("acknowledges production-shaped BLIK cart-id PENDING DMN without sessionToken or CT write", async () => {
      const { service } = createService();
      const payment = makeDmnMockPayment({
        id: "payment-from-cart",
        interfaceId: "nuvei-session-token",
        amountPlanned: { centAmount: 213700, currencyCode: "PLN" },
        paymentMethodInfo: { paymentInterface: "checkout-session-interface", method: "blik" },
        transactions: [
          {
            type: PaymentTransactions.CHARGE,
            state: "Initial",
            interactionId: "nuvei-session-token",
            amount: { centAmount: 213700, currencyCode: "PLN" },
          },
        ],
      } as any);
      const body = {
        ...dmnAuthOk,
        merchant_unique_id: "cart-123",
        clientUniqueId: "cart-123",
        TransactionID: "8110000000033421107",
        PPP_TransactionID: "18816543111",
        transactionType: "Sale",
        ppp_status: "PENDING",
        Status: "PENDING",
        totalAmount: "2137.00",
        currency: "PLN",
      };

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        version: 7,
        paymentInfo: { payments: [{ typeId: "payment", id: "payment-from-cart" }] },
      });
      mockGetPayment.mockImplementation(async ({ id }: { id: string }) => {
        if (id === "cart-123") {
          throw Object.assign(new Error("Resource with ID 'cart-123' was not found"), {
            code: "ResourceNotFound",
            statusCode: 404,
          });
        }
        if (id === "payment-from-cart") {
          return payment;
        }
        throw new Error(`Unexpected payment lookup: ${id}`);
      });
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({
          sessionToken: undefined,
          transactionStatus: "PENDING",
          amount: "2137.00",
          currency: "PLN",
          clientUniqueId: "cart-123",
          transactionType: "Sale",
        }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "18816543111",
          transactions: [
            {
              type: PaymentTransactions.CHARGE,
              interactionId: "18816543111",
              amount: { centAmount: 213700, currencyCode: "PLN" },
              state: "Pending",
            },
          ],
          interfaceCode: undefined,
          paymentMethod: undefined,
          paymentMethodName: undefined,
        }),
      );

      await expect(service.processNuveiDmn(body)).resolves.toBeUndefined();

      expect(mockFindPaymentsByInterfaceId).not.toHaveBeenCalled();
      expect(mockConvertDmnToPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ merchant_unique_id: "payment-from-cart" }),
        213700,
      );
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("does not resolve cart-id DMNs to foreign payments with a matching interface transaction", async () => {
      const { service } = createService();
      const payment = makeDmnMockPayment({
        id: "foreign-payment",
        interfaceId: "foreign-session-token",
        paymentMethodInfo: { paymentInterface: "foreign-checkout-interface", method: "Visa" },
        transactions: [
          {
            type: PaymentTransactions.AUTHORIZATION,
            state: "Initial",
            interactionId: "foreign-session-token",
            amount: { centAmount: 1000, currencyCode: "USD" },
          },
        ],
      } as any);
      const body = {
        ...dmnAuthOk,
        merchant_unique_id: "cart-123",
      };

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        version: 7,
        paymentInfo: { payments: [{ typeId: "payment", id: "foreign-payment" }] },
      });
      mockGetPayment.mockImplementation(async ({ id }: { id: string }) => {
        if (id === "cart-123") {
          throw new Error("The Resource with ID 'cart-123' was not found.");
        }
        if (id === "foreign-payment") {
          return payment;
        }
        throw new Error(`Unexpected payment lookup: ${id}`);
      });
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "foreign-session-token", clientUniqueId: "other-cart" }),
      );

      await expect(service.processNuveiDmn(body)).rejects.toThrow(
        "Missing DMN session token for Payment fallback",
      );

      expect(mockNuveiClientInstance.getPaymentStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionToken: "foreign-session-token",
          signal: expect.any(AbortSignal),
        }),
      );
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("rejects cart-id DMNs when too many session-bound fallback candidates exist", async () => {
      const { service } = createService();
      const payments = Array.from({ length: 4 }, (_, index) => {
        const sessionToken = `session-token-${index}`;
        return makeDmnMockPayment({
          id: `payment-${index}`,
          interfaceId: sessionToken,
          paymentMethodInfo: { paymentInterface: "checkout-session-interface", method: "Visa" },
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              state: "Initial",
              interactionId: sessionToken,
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        } as any);
      });

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        version: 7,
        paymentInfo: { payments: payments.map((payment) => ({ typeId: "payment", id: payment.id })) },
      });
      mockGetPayment.mockImplementation(async ({ id }: { id: string }) => {
        if (id === "cart-123") {
          throw new Error("The Resource with ID 'cart-123' was not found.");
        }
        const payment = payments.find((candidate) => candidate.id === id);
        if (payment) return payment;
        throw new Error(`Unexpected payment lookup: ${id}`);
      });

      await expect(
        service.processNuveiDmn({ ...dmnAuthOk, merchant_unique_id: "cart-123" }),
      ).rejects.toThrow("Too many session-bound Payments found for DMN cart reference");

      expect(mockNuveiClientInstance.getPaymentStatus).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("does not let session-bound overflow block a static Nuvei cart candidate", async () => {
      const { service } = createService();
      const staticPayment = makeDmnMockPayment({
        id: "static-nuvei-payment",
        interfaceId: "nuvei-session-token",
        paymentMethodInfo: { paymentInterface: "nuvei", method: "card" },
        transactions: [
          {
            type: PaymentTransactions.AUTHORIZATION,
            state: "Initial",
            interactionId: "nuvei-session-token",
            amount: { centAmount: 1000, currencyCode: "USD" },
          },
          {
            type: PaymentTransactions.AUTHORIZATION,
            state: "Success",
            interactionId: "50001",
            amount: { centAmount: 1000, currencyCode: "USD" },
          },
        ],
      } as any);
      const sessionBoundPayments = Array.from({ length: 4 }, (_, index) => {
        const sessionToken = `foreign-session-token-${index}`;
        return makeDmnMockPayment({
          id: `foreign-payment-${index}`,
          interfaceId: sessionToken,
          paymentMethodInfo: { paymentInterface: "checkout-session-interface", method: "Visa" },
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              state: "Initial",
              interactionId: sessionToken,
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        } as any);
      });
      const payments = [staticPayment, ...sessionBoundPayments];

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        version: 7,
        paymentInfo: { payments: payments.map((payment) => ({ typeId: "payment", id: payment.id })) },
      });
      mockGetPayment.mockImplementation(async ({ id }: { id: string }) => {
        if (id === "cart-123") {
          throw new Error("The Resource with ID 'cart-123' was not found.");
        }
        const payment = payments.find((candidate) => candidate.id === id);
        if (payment) return payment;
        throw new Error(`Unexpected payment lookup: ${id}`);
      });

      await expect(
        service.processNuveiDmn({ ...dmnAuthOk, merchant_unique_id: "cart-123" }),
      ).resolves.toBeUndefined();

      expect(mockNuveiClientInstance.getPaymentStatus).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("bounds session-bound fallback verification time", async () => {
      vi.useFakeTimers();
      try {
        const { service } = createService();
        const payment = makeDmnMockPayment({
          id: "payment-from-cart",
          interfaceId: "nuvei-session-token",
          paymentMethodInfo: { paymentInterface: "checkout-session-interface", method: "Visa" },
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              state: "Initial",
              interactionId: "nuvei-session-token",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        } as any);

        mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
        mockGetCart.mockResolvedValue({
          id: "cart-123",
          version: 7,
          paymentInfo: { payments: [{ typeId: "payment", id: "payment-from-cart" }] },
        });
        mockGetPayment.mockImplementation(async ({ id }: { id: string }) => {
          if (id === "cart-123") {
            throw new Error("The Resource with ID 'cart-123' was not found.");
          }
          if (id === "payment-from-cart") return payment;
          throw new Error(`Unexpected payment lookup: ${id}`);
        });
        mockNuveiClientInstance.getPaymentStatus.mockReturnValue(new Promise(() => undefined));

        const processing = expect(
          service.processNuveiDmn({ ...dmnAuthOk, merchant_unique_id: "cart-123" }),
        ).rejects.toThrow("Missing DMN session token for Payment fallback");
        await vi.advanceTimersByTimeAsync(3_000);

        await processing;
        expect(mockNuveiClientInstance.getPaymentStatus).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionToken: "nuvei-session-token",
            signal: expect.any(AbortSignal),
          }),
        );
        expect(mockUpdatePayment).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("resolves cart-id DMN to the Payment that already has the Nuvei transaction id", async () => {
      const { service } = createService();
      const paymentWithoutTransaction = makeDmnMockPayment({
        id: "older-payment",
        interfaceId: "older-session-token",
        paymentMethodInfo: { paymentInterface: "nuvei", method: "card" },
      } as any);
      const paymentWithTransaction = makeDmnMockPayment({
        id: "confirmed-payment",
        interfaceId: "confirmed-session-token",
        paymentMethodInfo: { paymentInterface: "nuvei", method: "card" },
        transactions: [
          {
            type: PaymentTransactions.AUTHORIZATION,
            state: "Success",
            interactionId: "tx-auth-001",
            amount: { centAmount: 1000, currencyCode: "USD" },
          },
        ],
      } as any);
      const body = {
        ...dmnAuthOk,
        merchant_unique_id: "cart-123",
      };

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        version: 7,
        paymentInfo: {
          payments: [
            { typeId: "payment", id: "older-payment" },
            { typeId: "payment", id: "confirmed-payment" },
          ],
        },
      });
      mockGetPayment.mockImplementation(async ({ id }: { id: string }) => {
        if (id === "cart-123") {
          throw new Error("The Resource with ID 'cart-123' was not found.");
        }
        if (id === "older-payment") return paymentWithoutTransaction;
        if (id === "confirmed-payment") return paymentWithTransaction;
        throw new Error(`Unexpected payment lookup: ${id}`);
      });
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "50001",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );

      await service.processNuveiDmn(body);

      expect(mockConvertDmnToPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ merchant_unique_id: "confirmed-payment" }),
        1000,
      );
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("resolves cart-id DMN to the only candidate with an existing terminal outcome", async () => {
      const { service } = createService();
      const pendingPayment = makeDmnMockPayment({
        id: "pending-payment",
        interfaceId: "pending-session-token",
        paymentMethodInfo: { paymentInterface: "nuvei", method: "card" },
      } as any);
      const terminalPayment = makeDmnMockPayment({
        id: "terminal-payment",
        interfaceId: "terminal-session-token",
        paymentMethodInfo: { paymentInterface: "nuvei", method: "card" },
        transactions: [
          {
            type: PaymentTransactions.AUTHORIZATION,
            state: "Success",
            interactionId: "status-fallback-id",
            amount: { centAmount: 1000, currencyCode: "USD" },
          },
        ],
      } as any);
      const body = {
        ...dmnAuthOk,
        merchant_unique_id: "cart-123",
        TransactionID: "different-dmn-transaction-id",
      };

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetCart.mockResolvedValue({
        id: "cart-123",
        version: 7,
        paymentInfo: {
          payments: [
            { typeId: "payment", id: "pending-payment" },
            { typeId: "payment", id: "terminal-payment" },
          ],
        },
      });
      mockGetPayment.mockImplementation(async ({ id }: { id: string }) => {
        if (id === "cart-123") {
          throw new Error("The Resource with ID 'cart-123' was not found.");
        }
        if (id === "pending-payment") return pendingPayment;
        if (id === "terminal-payment") return terminalPayment;
        throw new Error(`Unexpected payment lookup: ${id}`);
      });
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "50001",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );

      await service.processNuveiDmn(body);

      expect(mockConvertDmnToPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ merchant_unique_id: "terminal-payment" }),
        1000,
      );
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("rejects when merchant_unique_id payment conflicts with DMN sessionToken", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({ id: "payment-1", interfaceId: "different-session-token" }),
      );

      await expect(
        service.processNuveiDmn({ ...dmnAuthOk, sessionToken: "nuvei-session-token" }),
      ).rejects.toThrow("DMN session token does not match merchant_unique_id payment");

      expect(mockFindPaymentsByInterfaceId).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – resolution by Nuvei order key (nuvei-<PPP_TransactionID>)
  // -------------------------------------------------------------------------
  describe("resolution by Nuvei order key", () => {
    it("resolves a cart-id DMN by key without scanning the cart or verifying siblings", async () => {
      const keyed = makeDmnMockPayment({
        id: "keyed-payment",
        key: "nuvei-50001",
        interfaceId: "nuvei-session-token",
      } as any);
      const keyClient = makePaymentKeyClient(vi.fn().mockResolvedValue({ body: keyed }));
      const { service } = createService({ ctPaymentClient: keyClient.client });

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({ id: "keyed-payment", pspReference: "50001" }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn({ ...dmnAuthOk, merchant_unique_id: "cart-123" });

      // dmnAuthOk carries PPP_TransactionID 50001.
      expect(keyClient.withKey).toHaveBeenCalledWith({ key: "nuvei-50001" });
      expect(mockGetCart).not.toHaveBeenCalled();
      expect(mockGetPayment).not.toHaveBeenCalledWith({ id: "cart-123" });
      expect(mockConvertDmnToPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ merchant_unique_id: "keyed-payment" }),
        1000,
      );
      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: "keyed-payment" }),
      );
    });

    it("falls back to the legacy resolution when no Payment has the key", async () => {
      const notFound = Object.assign(new Error("not found"), { statusCode: 404 });
      const keyClient = makePaymentKeyClient(vi.fn().mockRejectedValue(notFound));
      const { service } = createService({ ctPaymentClient: keyClient.client });

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(defaultConverterReturn());
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(dmnAuthOk);

      expect(keyClient.withKey).toHaveBeenCalledWith({ key: "nuvei-50001" });
      expect(mockGetPayment).toHaveBeenCalledWith({ id: "payment-1" });
      expect(mockUpdatePayment).toHaveBeenCalled();
    });

    it("does not look up by key when the client is not wired", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(defaultConverterReturn());
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(dmnAuthOk);

      expect(mockGetPayment).toHaveBeenCalledWith({ id: "payment-1" });
    });

    it("skips the key lookup when the DMN carries no PPP transaction id", async () => {
      const keyClient = makePaymentKeyClient(vi.fn());
      const { service } = createService({ ctPaymentClient: keyClient.client });
      const { PPP_TransactionID: _ppp, ...bodyWithoutPpp } = dmnAuthOk;

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(defaultConverterReturn());
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(bodyWithoutPpp);

      expect(keyClient.withKey).not.toHaveBeenCalled();
    });

    it("rejects when the DMN sessionToken conflicts with the key-resolved Payment", async () => {
      const keyed = makeDmnMockPayment({ id: "keyed-payment", interfaceId: "other-session" } as any);
      const keyClient = makePaymentKeyClient(vi.fn().mockResolvedValue({ body: keyed }));
      const { service } = createService({ ctPaymentClient: keyClient.client });

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);

      await expect(
        service.processNuveiDmn({ ...dmnAuthOk, sessionToken: "nuvei-session-token" }),
      ).rejects.toThrow("DMN session token does not match Nuvei order key payment");

      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });

    it("propagates non-404 key lookup failures instead of guessing another Payment", async () => {
      const keyClient = makePaymentKeyClient(
        vi.fn().mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 503 })),
      );
      const { service } = createService({ ctPaymentClient: keyClient.client });

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);

      await expect(service.processNuveiDmn(dmnAuthOk)).rejects.toThrow("boom");

      expect(mockGetPayment).not.toHaveBeenCalled();
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – amount mismatch
  // -------------------------------------------------------------------------
  describe("amount mismatch validation", () => {
    it("rejects when DMN amount does not match CT Payment amountPlanned", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "tx-amount-mismatch-001",
              amount: { centAmount: 9999, currencyCode: "USD" }, // 99.99 USD ≠ 10.00 USD
              state: "Success",
            },
          ],
        }),
      );

      await expect(service.processNuveiDmn(dmnAmountMismatch)).rejects.toThrow(
        "DMN amount does not match payment",
      );

      // updatePayment should NOT have been called for the transaction
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – currency mismatch
  // -------------------------------------------------------------------------
  describe("currency mismatch validation", () => {
    it("rejects when DMN currency does not match CT Payment currency", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "tx-currency-mismatch-001",
              amount: { centAmount: 1000, currencyCode: "EUR" }, // EUR ≠ USD
              state: "Success",
            },
          ],
        }),
      );

      await expect(service.processNuveiDmn(dmnCurrencyMismatch)).rejects.toThrow(
        "DMN currency does not match payment",
      );

      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – malformed DMN
  // -------------------------------------------------------------------------
  describe("malformed DMN handling", () => {
    it("converter throws on missing required fields", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockImplementation(() => {
        throw new Error("Missing required DMN field: TransactionID or TransactionId");
      });

      await expect(service.processNuveiDmn(dmnMalformed)).rejects.toThrow(
        "Missing required DMN field: TransactionID or TransactionId",
      );
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – Nuvei status verification
  // -------------------------------------------------------------------------
  describe("Nuvei status cross-check", () => {
    it("rejects when Nuvei getPaymentStatus returns non-SUCCESS status", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "tx-auth-001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue({
        status: "ERROR",
        transactionStatus: "DECLINED",
        transactionId: "tx-auth-001",
        sessionToken: "nuvei-session-token",
      });

      await expect(service.processNuveiDmn(dmnAuthOk)).rejects.toThrow(
        "Nuvei payment status does not confirm successful DMN",
      );
    });

    it("does not reject on fiscal transactionId mismatch (pspReference is now PPP, fiscal ID comparison removed)", async () => {
      // After PPP canonicalization, the assertDmnMatchesNuveiStatus no longer compares
      // statusBody.transactionId to updateData.pspReference (which is now PPP, not fiscal TX).
      // The cross-check still validates status, sessionToken, clientUniqueId, amount, and currency.
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "ppp-50001", // now PPP-based, not fiscal
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "ppp-50001",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Success",
            },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({
          transactionId: "different-fiscal-tx-id", // different from PPP – no longer validated
          sessionToken: "nuvei-session-token",
          clientUniqueId: "cart-123",
        }),
      );

      // Should succeed because fiscal transactionId comparison is removed (D-12, D-13)
      await expect(service.processNuveiDmn(dmnAuthOk)).resolves.toBeUndefined();
      expect(mockUpdatePayment).toHaveBeenCalled();
    });

    it("rejects when Nuvei status clientUniqueId does not match DMN", async () => {
      const { service, body } = setupSuccessfulStatusCheck({
        statusOverrides: { clientUniqueId: "different-cart-id" },
      });

      await expect(service.processNuveiDmn(body)).rejects.toThrow(
        "Nuvei payment status clientUniqueId does not match DMN",
      );
    });

    it("rejects when DMN clientUniqueId is missing from successful status check", async () => {
      const { service, body } = setupSuccessfulStatusCheck();
      delete body.clientUniqueId;

      await expect(service.processNuveiDmn(body)).rejects.toThrow("DMN is missing clientUniqueId");
    });

    it("rejects when Nuvei status clientUniqueId is missing from successful status check", async () => {
      const { service, body } = setupSuccessfulStatusCheck({
        statusOverrides: { clientUniqueId: undefined },
      });

      await expect(service.processNuveiDmn(body)).rejects.toThrow(
        "Nuvei payment status is missing clientUniqueId",
      );
    });
  });

  // -------------------------------------------------------------------------
  // processNuveiDmn – updates payment method info
  // -------------------------------------------------------------------------
  describe("payment method info updates", () => {
    it("updates paymentMethod and paymentMethodName when present in converter output", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          paymentMethod: "Visa",
          paymentMethodName: { en: "Credit Card" },
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(dmnAuthOk);

      // Terminal transaction and paymentMethodInfo are applied in one atomic call.
      expect(mockUpdatePayment).toHaveBeenCalledTimes(1);
      expect(mockUpdatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethodInfo: { method: "Visa", name: { en: "Credit Card" } },
        }),
      );
    });

    it("does not update paymentMethod when absent from converter output", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          paymentMethod: undefined,
          paymentMethodName: undefined,
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(dmnAuthOk);

      // Single updatePayment carries only the transaction; no paymentMethodInfo key.
      expect(mockUpdatePayment).toHaveBeenCalledTimes(1);
      expect(mockUpdatePayment.mock.calls[0][0].paymentMethodInfo).toBeUndefined();
    });
  });

  describe("transaction write", () => {
    it("throws when the converter yields no transaction to write", async () => {
      const { service } = createService();

      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ sessionToken: "nuvei-session-token" }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(defaultConverterReturn({ transactions: [] }));

      await expect(service.processNuveiDmn(dmnAuthOk)).rejects.toThrow(
        "DMN update produced no transaction to write",
      );
      expect(mockUpdatePayment).not.toHaveBeenCalled();
    });
  });
  // -------------------------------------------------------------------------
  // Order paymentState sync
  // -------------------------------------------------------------------------
  describe("order paymentState sync", () => {
    const chargeSuccess = () =>
      defaultConverterReturn({
        pspReference: "tx-settle-001",
        transactions: [
          {
            type: PaymentTransactions.CHARGE,
            interactionId: "tx-settle-001",
            amount: { centAmount: 1000, currencyCode: "USD" },
            state: "Success",
          },
        ],
        interfaceCode: "paid",
      });

    it("syncs the Order after an approved terminal transaction is written", async () => {
      const orderPaymentStateSync = { syncWithRetry: vi.fn().mockResolvedValue("updated") };
      const { service } = createService({ orderPaymentStateSync });
      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(chargeSuccess());
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ transactionId: "tx-settle-001", sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(dmnSettleOk);

      expect(mockUpdatePayment).toHaveBeenCalledTimes(1);
      expect(orderPaymentStateSync.syncWithRetry).toHaveBeenCalledWith("payment-1");
    });

    it("does not sync the Order for a failed payment DMN", async () => {
      const orderPaymentStateSync = { syncWithRetry: vi.fn().mockResolvedValue("not-paid") };
      const { service } = createService({ orderPaymentStateSync });
      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(
        defaultConverterReturn({
          pspReference: "tx-auth-fail",
          transactions: [
            {
              type: PaymentTransactions.AUTHORIZATION,
              interactionId: "tx-auth-fail",
              amount: { centAmount: 1000, currencyCode: "USD" },
              state: "Failure",
            },
          ],
        }),
      );
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ transactionStatus: "DECLINED", sessionToken: "nuvei-session-token" }),
      );

      await service.processNuveiDmn(dmnAuthFail);

      expect(orderPaymentStateSync.syncWithRetry).not.toHaveBeenCalled();
    });

    it("re-syncs the Order when the approved terminal transaction was already recorded (repair)", async () => {
      const orderPaymentStateSync = { syncWithRetry: vi.fn().mockResolvedValue("updated") };
      const { service } = createService({ orderPaymentStateSync });
      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(
        makeDmnMockPayment({
          interfaceId: "nuvei-session-token",
          transactions: [
            {
              type: "Charge",
              state: "Success",
              interactionId: "tx-settle-001",
              amount: { centAmount: 1000, currencyCode: "USD" },
            },
          ],
        }),
      );
      mockConvertDmnToPaymentUpdate.mockReturnValue(chargeSuccess());

      await service.processNuveiDmn(dmnSettleOk);

      expect(mockUpdatePayment).not.toHaveBeenCalled();
      expect(orderPaymentStateSync.syncWithRetry).toHaveBeenCalledWith("payment-1");
    });

    it("still acknowledges the DMN when the Order sync rejects", async () => {
      const orderPaymentStateSync = { syncWithRetry: vi.fn().mockRejectedValue(new Error("boom")) };
      const { service } = createService({ orderPaymentStateSync });
      mockNuveiClientInstance.validateDmnChecksum.mockReturnValue(true);
      mockGetPayment.mockResolvedValue(makeDmnMockPayment({ interfaceId: "nuvei-session-token" }));
      mockConvertDmnToPaymentUpdate.mockReturnValue(chargeSuccess());
      mockNuveiClientInstance.getPaymentStatus.mockResolvedValue(
        defaultPaymentStatus({ transactionId: "tx-settle-001", sessionToken: "nuvei-session-token" }),
      );

      await expect(service.processNuveiDmn(dmnSettleOk)).resolves.toBeUndefined();
    });
  });
});
