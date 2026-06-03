import {
  CommercetoolsCartService,
  CommercetoolsOrderService,
  CommercetoolsPaymentService,
  ErrorInvalidOperation,
  healthCheckCommercetoolsPermissions,
  statusHandler,
} from "@commercetools/connect-payments-sdk";
import {
  CancelPaymentRequest,
  CapturePaymentRequest,
  ConfigResponse,
  PaymentProviderModificationResponse,
  RefundPaymentRequest,
  ReversePaymentRequest,
  StatusResponse,
} from "./types/operation.type.js";
import {
  PAYMENT_METHOD_REGISTRY,
  SupportedPaymentComponentsSchemaDTO,
  isSupportedPaymentMethod,
} from "../dtos/operations/payment-components.dto.js";
import {
  PaymentModificationStatus,
  PaymentTransactions,
} from "../dtos/operations/payment-intents.dto.js";
import { TransactionDraftDTO, TransactionResponseDTO } from "../dtos/operations/transaction.dto.js";
import { HealthResponseSchemaDTO } from "../dtos/operations/health.dto.js";
import { AbstractPaymentService } from "./abstract-payment.service.js";
import { getConfig } from "../config/config.js";
import { appLogger, paymentSDK } from "../payment-sdk.js";
import { log } from "../libs/logger/index.js";
import {
  getCartIdFromContext,
  getMerchantReturnUrlFromContext,
} from "../libs/fastify/context/context.js";
import { nuveiClient } from "../clients/nuvei.client.js";
import { CtPaymentCreationService } from "./ct-payment-creation.service.js";
import {
  NuveiEventConverter,
  type NuveiDmnUpdateData,
} from "./converters/nuvei-event.converter.js";
import type { Payment } from "@commercetools/platform-sdk";
import {
  PaymentSetupError,
  PublicPaymentErrorCode,
} from "../dtos/operations/payment-errors.dto.js";

export type NuveiPaymentServiceOptions = {
  ctCartService: CommercetoolsCartService;
  ctPaymentService: CommercetoolsPaymentService;
  ctOrderService: CommercetoolsOrderService;
};

export class DmnChecksumInvalidError extends Error {
  public constructor() {
    super("Invalid DMN checksum");
  }
}

// ---------------------------------------------------------------------------
// Canonical Nuvei PPP identity constants (D-13)
// PPP_TransactionID is the mandatory Nuvei payment-page transaction identifier.
// All three variants are documented in Nuvei DMN docs/examples.
// ---------------------------------------------------------------------------
const PPP_TRANSACTION_ID_KEYS = [
  "PPP_TransactionID",
  "PPP_TransactionId",
  "ppp_TransactionID",
] as const;

/**
 * Extract the canonical Nuvei PPP transaction ID from a Nuvei status/DMN body.
 * Returns the first non-empty value found from documented PPP variants.
 * Never treats lower-camel `transactionId` (fiscal gateway ID) as PPP.
 */
function extractCanonicalPpp(body: Record<string, unknown>): string | undefined {
  for (const key of PPP_TRANSACTION_ID_KEYS) {
    const value = body[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Strict Nuvei status classifier (D-08):
 * - approved: status=SUCCESS AND transactionStatus=APPROVED
 * - rejected: status=SUCCESS AND transactionStatus in {DECLINED, ERROR}
 * - pending: everything else (unknown, missing, PENDING, UPDATE, cashier ERROR, etc.)
 */
function classifyNuveiStatus(
  status: unknown,
  transactionStatus: unknown,
): "approved" | "rejected" | "pending" {
  if (status === "SUCCESS") {
    if (transactionStatus === "APPROVED") return "approved";
    if (transactionStatus === "DECLINED" || transactionStatus === "ERROR") return "rejected";
  }
  return "pending";
}

export class NuveiPaymentService extends AbstractPaymentService {
  private paymentCreationService: CtPaymentCreationService;
  private nuveiEventConverter: NuveiEventConverter;

  constructor(opts: NuveiPaymentServiceOptions) {
    super(opts.ctCartService, opts.ctPaymentService, opts.ctOrderService);
    this.paymentCreationService = new CtPaymentCreationService({
      ctCartService: opts.ctCartService,
      ctPaymentService: opts.ctPaymentService,
    });
    this.nuveiEventConverter = new NuveiEventConverter();
  }

  private formatAmount(amount: {
    centAmount: number;
    currencyCode: string;
    fractionDigits?: number;
  }): string {
    const fractionDigits =
      amount.fractionDigits ?? this.getCurrencyFractionDigits(amount.currencyCode);
    return (amount.centAmount / 10 ** fractionDigits).toFixed(fractionDigits);
  }

  private getCurrencyFractionDigits(currencyCode: string): number {
    return (
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  }

  private getTransactionInteractionId(
    payment: Payment,
    transactionType: string,
  ): string | undefined {
    for (let index = payment.transactions.length - 1; index >= 0; index -= 1) {
      const transaction = payment.transactions[index];
      if (
        transaction.type === transactionType &&
        transaction.state === "Success" &&
        transaction.interactionId
      ) {
        return transaction.interactionId;
      }
    }

    return undefined;
  }

  private redactToken(token: string): string {
    if (token.length <= 10) {
      return "[redacted]";
    }
    return `${token.slice(0, 6)}...[redacted]...${token.slice(-4)}`;
  }

  public validatePaymentMethodOptions(options?: unknown): "card" {
    if (options === undefined) {
      return "card";
    }

    if (!this.isPlainObject(options)) {
      throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: "options_not_object",
      });
    }

    const paymentMethodOptions = (options as { paymentMethodOptions?: unknown })
      .paymentMethodOptions;
    if (paymentMethodOptions === undefined) {
      return "card";
    }

    if (!this.isPlainObject(paymentMethodOptions)) {
      throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: "method_options_not_object",
      });
    }

    const methods = Object.keys(paymentMethodOptions);
    if (methods.length !== 1) {
      throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: methods.length === 0 ? "method_missing" : "method_ambiguous",
      });
    }

    const [paymentMethod] = methods;
    if (!paymentMethod) {
      throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: "method_empty",
      });
    }

    if (!isSupportedPaymentMethod(paymentMethod)) {
      throw new PaymentSetupError(PublicPaymentErrorCode.METHOD_UNSUPPORTED, {
        category: "method_unsupported",
        requestedMethod: paymentMethod,
      });
    }

    const methodOptions = (paymentMethodOptions as Record<string, unknown>)[paymentMethod];
    if (!this.isPlainObject(methodOptions) || Object.keys(methodOptions).length > 0) {
      throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: "method_payload_invalid",
        requestedMethod: paymentMethod,
      });
    }

    return paymentMethod;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private paymentHasInteraction(payment: Payment, interactionId: string): boolean {
    return (
      payment.interfaceId === interactionId ||
      (payment.transactions ?? []).some((tx) => tx.interactionId === interactionId)
    );
  }

  private async assertSessionPaymentAccess(
    paymentReference: string,
    sessionToken: string,
    payment: Payment,
  ): Promise<void> {
    if (!this.paymentHasInteraction(payment, sessionToken)) {
      throw new Error("Payment does not match Nuvei session token");
    }

    const cartId = getCartIdFromContext();
    const cart = await this.ctCartService.getCart({ id: cartId });
    const paymentRefs = cart.paymentInfo?.payments ?? [];
    const isPaymentOnCart = paymentRefs.some((paymentRef) => paymentRef.id === paymentReference);

    if (!isPaymentOnCart) {
      throw new Error("Payment does not belong to authenticated cart session");
    }
  }

  private assertNuveiStatusMatchesPayment(
    statusBody: Record<string, unknown>,
    payment: Payment,
    cartId: string,
    requireFinancialFields = false,
  ): void {
    const clientUniqueId = statusBody.clientUniqueId;
    if (clientUniqueId !== undefined && String(clientUniqueId) !== cartId) {
      throw new Error("Nuvei payment status does not match cart");
    }

    const currency = statusBody.currency;
    if (requireFinancialFields && currency === undefined) {
      throw new Error("Nuvei payment status is missing currency");
    }
    if (currency !== undefined && String(currency) !== payment.amountPlanned.currencyCode) {
      throw new Error("Nuvei payment status currency does not match payment");
    }

    const amount = statusBody.amount;
    if (requireFinancialFields && amount === undefined) {
      throw new Error("Nuvei payment status is missing amount");
    }
    if (amount !== undefined) {
      const statusCentAmount = this.parseAmountToCentAmount(
        amount,
        payment.amountPlanned.currencyCode,
      );
      if (statusCentAmount !== payment.amountPlanned.centAmount) {
        throw new Error("Nuvei payment status amount does not match payment");
      }
    }
  }

  private assertDmnMatchesConfig(body: Record<string, unknown>): void {
    const config = getConfig();
    const merchantId = body.merchant_id ?? body.merchantId;
    const merchantSiteId = body.merchant_site_id ?? body.merchantSiteId;

    if (merchantId !== undefined && String(merchantId) !== config.nuveiMerchantId) {
      throw new Error("DMN merchant_id does not match configured merchant");
    }

    if (merchantSiteId !== undefined && String(merchantSiteId) !== config.nuveiMerchantSiteId) {
      throw new Error("DMN merchant_site_id does not match configured merchant site");
    }
  }

  private assertDmnUpdateMatchesPayment(
    updateData: {
      transactions: Array<{
        amount?: { centAmount: number; currencyCode: string };
        state?: string;
        type?: string;
      }>;
    },
    payment: Payment,
  ): void {
    for (const tx of updateData.transactions) {
      if (!tx.amount) {
        continue;
      }

      if (tx.amount.currencyCode !== payment.amountPlanned.currencyCode) {
        throw new Error("DMN currency does not match payment");
      }

      if (
        tx.state === "Success" &&
        (tx.type === PaymentTransactions.AUTHORIZATION || tx.type === PaymentTransactions.CHARGE) &&
        tx.amount.centAmount !== payment.amountPlanned.centAmount
      ) {
        throw new Error("DMN amount does not match payment");
      }
    }
  }

  private async assertDmnMatchesNuveiStatus(
    updateData: NuveiDmnUpdateData,
    payment: Payment,
    dmnBody: Record<string, unknown>,
  ): Promise<void> {
    const successfulPaymentTransaction = updateData.transactions.find(
      (tx) =>
        tx.state === "Success" &&
        (tx.type === PaymentTransactions.AUTHORIZATION || tx.type === PaymentTransactions.CHARGE),
    );

    if (!successfulPaymentTransaction) {
      return;
    }

    if (!payment.interfaceId) {
      throw new Error("Payment is missing Nuvei session token");
    }

    const statusBody = await nuveiClient().getPaymentStatus({ sessionToken: payment.interfaceId });

    if (statusBody.status !== "SUCCESS" || statusBody.transactionStatus !== "APPROVED") {
      throw new Error("Nuvei payment status does not confirm successful DMN");
    }

    if (statusBody.sessionToken !== undefined && statusBody.sessionToken !== payment.interfaceId) {
      throw new Error("Nuvei payment status session token does not match payment");
    }

    // pspReference is now canonical PPP; do not compare fiscal transactionId to PPP (D-12, D-13).

    const dmnClientUniqueId = dmnBody.clientUniqueId;
    if (dmnClientUniqueId === undefined) {
      throw new Error("DMN is missing clientUniqueId");
    }

    if (statusBody.clientUniqueId === undefined) {
      throw new Error("Nuvei payment status is missing clientUniqueId");
    }

    if (String(statusBody.clientUniqueId) !== String(dmnClientUniqueId)) {
      throw new Error("Nuvei payment status clientUniqueId does not match DMN");
    }

    // confirmPayment validates against session context; DMNs validate against the signed DMN body.
    this.assertNuveiStatusMatchesPayment(
      statusBody as Record<string, unknown>,
      payment,
      String(dmnClientUniqueId),
      true,
    );
  }

  private parseAmountToCentAmount(amount: unknown, currencyCode: string): number {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) {
      throw new Error("Invalid Nuvei amount");
    }
    const fractionDigits = this.getCurrencyFractionDigits(currencyCode);
    return Math.round(parsedAmount * 10 ** fractionDigits);
  }

  /**
   * Get configurations
   *
   * @remarks
   * Returns Nuvei-specific configuration for the frontend.
   *
   * @returns Promise with object containing environment, merchantId, merchantSiteId
   */
  public async config(): Promise<ConfigResponse> {
    const config = getConfig();
    return {
      environment: config.nuveiEnv,
      merchantId: config.nuveiMerchantId,
      merchantSiteId: config.nuveiMerchantSiteId,
    };
  }

  /**
   * Get status
   *
   * @remarks
   * Checks CT permissions and Nuvei API reachability.
   *
   * @returns Promise with status response
   */
  public async status(): Promise<StatusResponse> {
    const config = getConfig();
    const handler = await statusHandler({
      timeout: config.healthCheckTimeout,
      log: appLogger,
      checks: [
        healthCheckCommercetoolsPermissions({
          requiredPermissions: [
            "manage_payments",
            "view_sessions",
            "view_api_clients",
            "manage_checkout_payment_intents",
            "introspect_oauth_tokens",
          ],
          ctAuthorizationService: paymentSDK.ctAuthorizationService,
          projectKey: config.projectKey,
        }),
        async () => {
          try {
            await nuveiClient().isReachable();
            return {
              name: "Nuvei Status check",
              status: "UP",
              message: "Nuvei API is reachable",
            };
          } catch (e) {
            return {
              name: "Nuvei Status check",
              status: "DOWN",
              message: "Nuvei API is not reachable. Please check the logs for more details.",
              details: {
                error: e instanceof Error ? e.message : String(e),
              },
            };
          }
        },
      ],
      metadataFn: async () => ({
        name: "@nuvei-commercetools/processor",
      }),
    })();

    return handler.body;
  }

  public async health(): Promise<HealthResponseSchemaDTO> {
    const config = getConfig();
    const required = [
      { name: "CTP_PROJECT_KEY", value: config.projectKey },
      { name: "CTP_CLIENT_ID", value: config.clientId },
      { name: "CTP_CLIENT_SECRET", value: config.clientSecret },
      { name: "CTP_AUTH_URL", value: config.authUrl },
      { name: "CTP_API_URL", value: config.apiUrl },
      { name: "CTP_SESSION_URL", value: config.sessionUrl },
      { name: "CTP_CHECKOUT_URL", value: config.checkoutUrl },
      { name: "CTP_JWKS_URL", value: config.jwksUrl },
      { name: "CTP_JWT_ISSUER", value: config.jwtIssuer },
      { name: "NUVEI_MERCHANT_ID", value: config.nuveiMerchantId },
      { name: "NUVEI_MERCHANT_SITE_ID", value: config.nuveiMerchantSiteId },
      { name: "NUVEI_SECRET_KEY", value: config.nuveiSecretKey },
      { name: "NUVEI_API_BASE_URL", value: config.nuveiApiBaseUrl },
    ];
    const checks = required.map(({ name, value }) => ({
      name,
      status: value && value.trim().length > 0 ? ("ok" as const) : ("failed" as const),
    }));

    return {
      status: checks.every((check) => check.status === "ok") ? "ok" : "degraded",
      commit: config.buildCommit,
      checks,
    };
  }

  /**
   * Get supported payment components
   *
   * @remarks
   * Returns the supported payment components for the Nuvei integration.
   *
   * @returns Promise with supported payment components
   */
  public async getSupportedPaymentComponents(): Promise<SupportedPaymentComponentsSchemaDTO> {
    return {
      dropins: [],
      components: PAYMENT_METHOD_REGISTRY.filter((entry) => entry.kind === "component").map(
        (entry) => ({
          type: entry.advertisedType,
        }),
      ),
      express: [],
    };
  }

  /**
   * Capture payment in Nuvei (settleTransaction)
   *
   * @remarks
   * Settles a previously authorized transaction in Nuvei.
   *
   * @param request - contains the amount and Payment
   * @returns Promise with outcome and PSP reference
   */
  public async capturePayment(
    request: CapturePaymentRequest,
  ): Promise<PaymentProviderModificationResponse> {
    try {
      const interfaceId =
        this.getTransactionInteractionId(request.payment, PaymentTransactions.AUTHORIZATION) ??
        (request.payment.interfaceId as string);
      const amount = request.amount;
      const formattedAmount = this.formatAmount(amount);
      const currency = amount.currencyCode;

      log.info("Capturing payment via Nuvei settleTransaction.", {
        paymentId: request.payment.id,
        interfaceId,
        amount: formattedAmount,
        currency,
      });

      const response = await nuveiClient().settleTransaction({
        amount: formattedAmount,
        currency,
        relatedTransactionId: interfaceId,
      });

      log.info("Nuvei settleTransaction completed.", {
        paymentId: request.payment.id,
        interfaceId,
        outcome: PaymentModificationStatus.APPROVED,
      });

      return {
        outcome: PaymentModificationStatus.APPROVED,
        pspReference:
          ((response as Record<string, unknown>).transactionId as string) || interfaceId,
      };
    } catch (error) {
      log.error("Error capturing payment in Nuvei", {
        error: error instanceof Error ? error.message : String(error),
        paymentId: request.payment.id,
      });
      return {
        outcome: PaymentModificationStatus.REJECTED,
        pspReference: request.payment.interfaceId as string,
      };
    }
  }

  /**
   * Cancel payment in Nuvei (voidTransaction)
   *
   * @remarks
   * Voids a previously authorized transaction in Nuvei.
   *
   * @param request - contains the Payment
   * @returns Promise with outcome and PSP reference
   */
  public async cancelPayment(
    request: CancelPaymentRequest,
  ): Promise<PaymentProviderModificationResponse> {
    try {
      const interfaceId =
        this.getTransactionInteractionId(request.payment, PaymentTransactions.AUTHORIZATION) ??
        (request.payment.interfaceId as string);
      const amount = request.payment.amountPlanned;
      const formattedAmount = this.formatAmount(amount);
      const currency = amount.currencyCode;

      log.info("Canceling payment via Nuvei voidTransaction.", {
        paymentId: request.payment.id,
        interfaceId,
      });

      const response = await nuveiClient().voidTransaction({
        amount: formattedAmount,
        currency,
        relatedTransactionId: interfaceId,
      });

      log.info("Nuvei voidTransaction completed.", {
        paymentId: request.payment.id,
        interfaceId,
        outcome: PaymentModificationStatus.APPROVED,
      });

      return {
        outcome: PaymentModificationStatus.APPROVED,
        pspReference:
          ((response as Record<string, unknown>).transactionId as string) || interfaceId,
      };
    } catch (error) {
      log.error("Error canceling payment in Nuvei", {
        error: error instanceof Error ? error.message : String(error),
        paymentId: request.payment.id,
      });
      return {
        outcome: PaymentModificationStatus.REJECTED,
        pspReference: request.payment.interfaceId as string,
      };
    }
  }

  /**
   * Refund payment in Nuvei (refundTransaction)
   *
   * @remarks
   * Refunds a previously captured transaction in Nuvei. Uses RECEIVED outcome
   * since refunds may be processed asynchronously.
   *
   * @param request - contains the amount and Payment
   * @returns Promise with outcome and PSP reference
   */
  public async refundPayment(
    request: RefundPaymentRequest,
  ): Promise<PaymentProviderModificationResponse> {
    try {
      const interfaceId =
        request.transactionId ??
        this.getTransactionInteractionId(request.payment, PaymentTransactions.CHARGE) ??
        (request.payment.interfaceId as string);
      const amount = request.amount;
      const formattedAmount = this.formatAmount(amount);
      const currency = amount.currencyCode;

      log.info("Refunding payment via Nuvei refundTransaction.", {
        paymentId: request.payment.id,
        interfaceId,
        amount: formattedAmount,
        currency,
      });

      const response = await nuveiClient().refundTransaction({
        amount: formattedAmount,
        currency,
        relatedTransactionId: interfaceId,
      });

      log.info("Nuvei refundTransaction completed.", {
        paymentId: request.payment.id,
        interfaceId,
        outcome: PaymentModificationStatus.RECEIVED,
      });

      return {
        outcome: PaymentModificationStatus.RECEIVED,
        pspReference:
          ((response as Record<string, unknown>).transactionId as string) || interfaceId,
      };
    } catch (error) {
      log.error("Error refunding payment in Nuvei", {
        error: error instanceof Error ? error.message : String(error),
        paymentId: request.payment.id,
      });
      return {
        outcome: PaymentModificationStatus.REJECTED,
        pspReference: request.payment.interfaceId as string,
      };
    }
  }

  /**
   * Reverse payment
   *
   * @remarks
   * Automatically determines whether to refund or cancel based on existing transactions.
   * If Charge exists and no refund/cancel → refund
   * If Authorization exists and no cancel → cancel
   * Otherwise throws ErrorInvalidOperation
   *
   * @param request - contains the Payment
   * @returns Promise with outcome and PSP reference
   */
  public async reversePayment(
    request: ReversePaymentRequest,
  ): Promise<PaymentProviderModificationResponse> {
    const hasCharge = this.ctPaymentService.hasTransactionInState({
      payment: request.payment,
      transactionType: "Charge",
      states: ["Success"],
    });
    const hasRefund = this.ctPaymentService.hasTransactionInState({
      payment: request.payment,
      transactionType: "Refund",
      states: ["Success", "Pending"],
    });
    const hasCancelAuthorization = this.ctPaymentService.hasTransactionInState({
      payment: request.payment,
      transactionType: "CancelAuthorization",
      states: ["Success", "Pending"],
    });

    const wasPaymentReverted = hasRefund || hasCancelAuthorization;

    if (hasCharge && !wasPaymentReverted) {
      return this.refundPayment({
        payment: request.payment,
        merchantReference: request.merchantReference,
        amount: request.payment.amountPlanned,
      });
    }

    const hasAuthorization = this.ctPaymentService.hasTransactionInState({
      payment: request.payment,
      transactionType: "Authorization",
      states: ["Success"],
    });

    if (hasAuthorization && !wasPaymentReverted) {
      return this.cancelPayment({ payment: request.payment });
    }

    throw new ErrorInvalidOperation("There is no successful payment transaction to reverse.");
  }

  /**
   * Handle the payment transaction request
   *
   * @remarks
   * Creates a Nuvei openOrder session and a corresponding CT Payment.
   *
   * @param transactionDraft - the incoming request payload
   * @returns Promise with transaction status
   */
  public async handleTransaction(
    transactionDraft: TransactionDraftDTO,
  ): Promise<TransactionResponseDTO> {
    try {
      const cart = await this.ctCartService.getCart({ id: transactionDraft.cartId });

      const amountPlanned =
        transactionDraft.amount ?? (await this.ctCartService.getPaymentAmount({ cart }));

      const formattedAmount = this.formatAmount(amountPlanned);

      log.info("Opening Nuvei order for transaction.", {
        cartId: cart.id,
        amount: formattedAmount,
        currency: amountPlanned.currencyCode,
      });

      const openOrderResponse = await nuveiClient().openOrder({
        amount: formattedAmount,
        currency: amountPlanned.currencyCode,
        clientUniqueId: cart.id,
      });

      const sessionToken = openOrderResponse.sessionToken;

      await this.paymentCreationService.handleCtPaymentCreation({
        interactionId: sessionToken,
        amountPlanned,
        cart,
      });

      log.info("Transaction created successfully.", {
        cartId: cart.id,
        sessionToken: this.redactToken(sessionToken),
      });

      return {
        transactionStatus: {
          state: "Pending",
          errors: [],
        },
      };
    } catch (error) {
      log.error("Error handling transaction", {
        error: error instanceof Error ? error.message : String(error),
        cartId: transactionDraft.cartId,
      });

      return {
        transactionStatus: {
          state: "Failed",
          errors: [
            {
              code: "PaymentRejected",
              message: "Failed to create payment transaction.",
            },
          ],
        },
      };
    }
  }

  /**
   * Create a payment session (openOrder) with Nuvei
   *
   * @remarks
   * Creates a Nuvei openOrder session and a corresponding CT Payment.
   *
   * @param options - Optional payment method options
   * @returns Promise with cartId, sessionToken, paymentReference, merchantReturnUrl
   */
  public async createPaymentSession(options?: unknown): Promise<{
    cartId: string;
    sessionToken: string;
    paymentReference: string;
    merchantReturnUrl: string;
    amount: string;
    currency: string;
  }> {
    try {
      const paymentMethod = this.validatePaymentMethodOptions(options);
      const cartId = getCartIdFromContext();
      const cart = await this.ctCartService.getCart({ id: cartId });
      const amountPlanned = await this.ctCartService.getPaymentAmount({ cart });
      const formattedAmount = this.formatAmount(amountPlanned);

      log.info("Creating Nuvei payment session via openOrder.", {
        cartId: cart.id,
        amount: formattedAmount,
        currency: amountPlanned.currencyCode,
        paymentMethod,
      });

      const openOrderResponse = await nuveiClient().openOrder({
        amount: formattedAmount,
        currency: amountPlanned.currencyCode,
        clientUniqueId: cart.id,
      });

      const sessionToken = openOrderResponse.sessionToken;

      const paymentReference = await this.paymentCreationService.handleCtPaymentCreation({
        interactionId: sessionToken,
        amountPlanned,
        cart,
        paymentMethod,
      });

      const config = getConfig();
      const merchantReturnUrl = getMerchantReturnUrlFromContext() || config.returnUrl;

      log.info("Payment session created successfully.", {
        cartId: cart.id,
        sessionToken: this.redactToken(sessionToken),
        paymentReference,
      });

      return {
        cartId: cart.id,
        sessionToken,
        paymentReference,
        merchantReturnUrl,
        amount: formattedAmount,
        currency: amountPlanned.currencyCode,
      };
    } catch (error) {
      if (error instanceof PaymentSetupError) {
        log.warn("Payment setup validation failed.", {
          route: "POST /payments/session",
          code: error.code,
          ...error.diagnostics,
        });
      } else {
        log.error("Error creating payment session", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  /**
   * Confirm a payment after frontend Nuvei widget completion.
   *
   * Returns a tri-state outcome: approved, rejected, or pending.
   *
   * CT terminal Authorization transactions are only written when canonical
   * PPP identity (PPP_TransactionID/PPP_TransactionId/ppp_TransactionID) is
   * available and no duplicate already exists. sessionToken and fiscal
   * transactionId are never used as CT terminal interactionId (D-10 through D-18).
   *
   * @param paymentReference - The CT Payment ID
   * @param sessionToken - The Nuvei session token
   * @returns Promise with outcome: "approved" | "rejected" | "pending"
   */
  public async confirmPayment(
    paymentReference: string,
    sessionToken: string,
  ): Promise<{ outcome: "approved" | "rejected" | "pending" }> {
    log.info("Confirming payment with Nuvei.", {
      paymentReference,
      sessionToken: this.redactToken(sessionToken),
    });

    const ctPayment = await this.ctPaymentService.getPayment({ id: paymentReference });
    await this.assertSessionPaymentAccess(paymentReference, sessionToken, ctPayment);

    const paymentStatus = await nuveiClient().getPaymentStatus({ sessionToken });
    const statusBody = paymentStatus as Record<string, unknown>;
    const outcome = classifyNuveiStatus(statusBody.status, statusBody.transactionStatus);
    const cartId = getCartIdFromContext();
    const requireFinancial = outcome === "approved";
    this.assertNuveiStatusMatchesPayment(statusBody, ctPayment, cartId, requireFinancial);

    if (outcome === "pending") {
      log.info("Payment status is pending/inconclusive – no CT terminal write.", {
        paymentReference,
        status: String(statusBody.status ?? ""),
        transactionStatus: String(statusBody.transactionStatus ?? ""),
      });
      return { outcome: "pending" };
    }

    // approved or rejected terminal candidate – require canonical PPP for CT write (D-14 through D-16)
    const ppp = extractCanonicalPpp(statusBody);

    if (!ppp) {
      // No canonical PPP identity available from getPaymentStatus (D-14).
      // approved-without-PPP → pending (cannot safely write terminal CT record).
      // rejected-without-PPP → return rejected business outcome without CT write.
      log.info("No canonical PPP identity in Nuvei status – skipping CT terminal write.", {
        paymentReference,
        outcome,
        status: String(statusBody.status ?? ""),
        transactionStatus: String(statusBody.transactionStatus ?? ""),
      });
      return { outcome: outcome === "rejected" ? "rejected" : "pending" };
    }

    // Check for existing canonical PPP Authorization to deduplicate (D-18).
    const alreadyRecorded = (ctPayment.transactions ?? []).some((tx) => tx.interactionId === ppp);

    if (alreadyRecorded) {
      log.info("Canonical PPP Authorization already recorded – short-circuiting.", {
        paymentReference,
        ppp,
        outcome,
      });
      return { outcome };
    }

    const transactionState: "Success" | "Failure" = outcome === "approved" ? "Success" : "Failure";

    log.info("Writing CT terminal Authorization.", {
      paymentReference,
      ppp,
      state: transactionState,
    });

    await this.ctPaymentService.updatePayment({
      id: ctPayment.id,
      pspReference: ppp,
      transaction: {
        type: PaymentTransactions.AUTHORIZATION,
        amount: ctPayment.amountPlanned,
        state: transactionState,
        interactionId: ppp,
      },
    });

    return { outcome };
  }

  /**
   * Process a Nuvei DMN (Direct Merchant Notification) webhook
   *
   * @remarks
   * Validates the DMN checksum, checks idempotency, and updates the CT Payment
   * with the appropriate transaction and payment status.
   *
   * @param body - The DMN request body
   */
  public async processNuveiDmn(body: Record<string, unknown>): Promise<void> {
    const config = getConfig();

    const isValid = nuveiClient().validateDmnChecksum(body, config.nuveiDmnChecksumAlgorithm);
    if (!isValid) {
      throw new DmnChecksumInvalidError();
    }

    this.assertDmnMatchesConfig(body);

    const paymentId = body.merchant_unique_id as string;
    if (!paymentId) {
      throw new Error("Missing merchant_unique_id in DMN body");
    }

    log.info("Processing Nuvei DMN.", {
      paymentId,
      transactionType: String(body.transactionType),
      pppStatus: String(body.ppp_status),
    });

    const ctPayment = await this.ctPaymentService.getPayment({ id: paymentId });

    // Idempotency: deduplicate by canonical PPP identity (D-18).
    // Do not deduplicate on optional fiscal TransactionID alone.
    const dmnPpp = extractCanonicalPpp(body);
    if (dmnPpp) {
      const existingInteractionIds = (ctPayment.transactions || [])
        .map((tx) => tx.interactionId)
        .filter((id): id is string => !!id);

      if (existingInteractionIds.includes(dmnPpp)) {
        log.info("DMN already processed (PPP duplicate), skipping.", {
          paymentId,
          ppp: dmnPpp,
        });
        return;
      }
    }

    const updateData = this.nuveiEventConverter.convertDmnToPaymentUpdate(
      body,
      ctPayment.amountPlanned?.centAmount,
    );
    this.assertDmnUpdateMatchesPayment(updateData, ctPayment);
    await this.assertDmnMatchesNuveiStatus(updateData, ctPayment, body);

    for (const tx of updateData.transactions) {
      await this.ctPaymentService.updatePayment({
        id: paymentId,
        pspReference: updateData.pspReference,
        transaction: tx,
      });
    }

    if (updateData.interfaceCode) {
      log.info("DMN interfaceCode determined.", {
        paymentId,
        interfaceCode: updateData.interfaceCode,
      });
    }

    if (updateData.paymentMethod) {
      await this.ctPaymentService.updatePayment({
        id: paymentId,
        pspReference: updateData.pspReference,
        paymentMethodInfo: {
          method: updateData.paymentMethod,
        },
      });
    }

    if (updateData.paymentMethodName) {
      await this.ctPaymentService.updatePayment({
        id: paymentId,
        pspReference: updateData.pspReference,
        paymentMethodInfo: {
          name: updateData.paymentMethodName,
        },
      });
    }

    log.info("DMN processed successfully.", {
      paymentId,
      transactionId: updateData.pspReference,
      interfaceCode: updateData.interfaceCode,
    });
  }
}
