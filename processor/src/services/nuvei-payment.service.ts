import {
  ErrorInvalidOperation,
  healthCheckCommercetoolsPermissions,
  statusHandler,
} from "@commercetools/connect-payments-sdk";
import type {
  CommercetoolsCartService,
  CommercetoolsOrderService,
  CommercetoolsPaymentService,
} from "@commercetools/connect-payments-sdk";
import type {
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
  isSupportedPaymentMethod,
} from "../dtos/operations/payment-components.dto.js";
import type {
  SupportedPaymentComponentsSchemaDTO,
  SupportedPaymentMethod,
} from "../dtos/operations/payment-components.dto.js";
import {
  PaymentModificationStatus,
  PaymentTransactions,
} from "../dtos/operations/payment-intents.dto.js";
import type { TransactionDraftDTO, TransactionResponseDTO } from "../dtos/operations/transaction.dto.js";
import type { HealthResponseSchemaDTO } from "../dtos/operations/health.dto.js";
import { AbstractPaymentService } from "./abstract-payment.service.js";
import { getConfig } from "../config/config.js";
import { appLogger, paymentSDK } from "../payment-sdk.js";
import { log } from "../libs/logger/index.js";
import {
  getCartIdFromContext,
  getMerchantReturnUrlFromContext,
} from "../libs/fastify/context/context.js";
import { nuveiClient } from "../clients/nuvei.client.js";
import type {
  NuveiTransactionResponse,
  OpenOrderBillingAddress,
} from "../clients/nuvei.client.js";
import { CtPaymentCreationService } from "./ct-payment-creation.service.js";
import { getTenderStrategy } from "./tenders/index.js";
import type { NuveiTender, NuveiIntegrationSurface } from "./tenders/index.js";
import {
  dmnHasNonTerminalPaymentTransaction,
  dmnTerminalPaymentOutcome,
  dmnTerminalTransactionAlreadyRecorded,
  getConfirmTerminalTransactionType,
  getExistingTerminalOutcome,
  hasTerminalTransaction,
  isPaymentTransaction,
  paymentHasInteraction,
} from "./payment-state.js";
import {
  assertNuveiStatusMatchesPayment,
  classifyNuveiStatus,
  extractCanonicalPpp,
  extractNuveiTransactionIdentities,
  extractNuveiTerminalIdentity,
  formatAmount,
  parseAmountToCentAmount,
} from "./nuvei-status.js";
import { NuveiEventConverter } from "./converters/nuvei-event.converter.js";
import type { NuveiDmnUpdateData } from "./converters/nuvei-event.converter.js";
import type { Cart, CartUpdateAction, Payment } from "@commercetools/platform-sdk";
import {
  PaymentSetupError,
  PublicPaymentErrorCode,
} from "../dtos/operations/payment-errors.dto.js";
import { NUVEI_PAYMENT_INTERFACE } from "../constants.js";

/**
 * Minimal structural slice of the platform SDK ByProjectKeyRequestBuilder used
 * for cart freeze/unfreeze. Structurally satisfied by paymentSDK.ctAPI.client
 * and trivially mockable in tests.
 */
export type CommercetoolsCartClient = {
  carts: () => {
    withId: (arg: { ID: string }) => {
      get: () => { execute: () => Promise<{ body: Cart }> };
      post: (arg: { body: { version: number; actions: CartUpdateAction[] } }) => {
        execute: () => Promise<{ body: Cart }>;
      };
    };
  };
};

export type NuveiPaymentServiceOptions = {
  ctCartService: CommercetoolsCartService;
  ctPaymentService: CommercetoolsPaymentService;
  ctOrderService: CommercetoolsOrderService;
  ctCartClient: CommercetoolsCartClient;
};

export class DmnChecksumInvalidError extends Error {
  public constructor() {
    super("Invalid DMN checksum");
  }
}

type CheckoutUiMethod = "card" | "blik" | "embedded";

type PaymentSelection =
  | { uiMethod: "card"; tender: "card"; surface: "web-sdk" }
  | { uiMethod: "blik"; tender: "blik"; surface: "web-sdk" }
  | { uiMethod: "embedded"; tender: "card"; surface: "simply-connect" }
  | { uiMethod: "embedded"; tender: "blik"; surface: "simply-connect" };

type PaymentSessionResponse = {
  cartId: string;
  sessionToken: string;
  paymentReference: string;
  merchantReturnUrl: string;
  amount: string;
  currency: string;
  uiMethod: CheckoutUiMethod;
  paymentMethod: NuveiTender;
  integrationSurface: NuveiIntegrationSurface;
  countryCode?: string;
};

const MAX_SESSION_BOUND_DMN_CANDIDATES = 3;
const DMN_SESSION_VERIFICATION_TIMEOUT_MS = 3_000;

function withAbortTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([operation(controller.signal), timeoutPromise]).finally(() =>
    clearTimeout(timeout),
  );
}

export class NuveiPaymentService extends AbstractPaymentService {
  private paymentCreationService: CtPaymentCreationService;
  private nuveiEventConverter: NuveiEventConverter;
  private ctCartClient: CommercetoolsCartClient;

  constructor(opts: NuveiPaymentServiceOptions) {
    super(opts.ctCartService, opts.ctPaymentService, opts.ctOrderService);
    this.paymentCreationService = new CtPaymentCreationService({
      ctCartService: opts.ctCartService,
      ctPaymentService: opts.ctPaymentService,
    });
    this.nuveiEventConverter = new NuveiEventConverter();
    this.ctCartClient = opts.ctCartClient;
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

  public validatePaymentMethodOptions(options?: unknown): PaymentSelection {
    if (options === undefined) {
      return { uiMethod: "card", tender: "card", surface: "web-sdk" };
    }

    if (!this.isPlainObject(options)) {
      throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: "options_not_object",
      });
    }

    const paymentMethodOptions = (options as { paymentMethodOptions?: unknown })
      .paymentMethodOptions;
    if (paymentMethodOptions === undefined) {
      return { uiMethod: "card", tender: "card", surface: "web-sdk" };
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
    if (!this.isPlainObject(methodOptions)) {
      throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
        category: "method_payload_invalid",
        requestedMethod: paymentMethod,
      });
    }

    const optionKeys = Object.keys(methodOptions);
    if (optionKeys.length === 0) {
      if (paymentMethod === "card") {
        return { uiMethod: "card", tender: "card", surface: "web-sdk" };
      }

      if (paymentMethod === "blik") {
        return { uiMethod: "blik", tender: "blik", surface: "web-sdk" };
      }

      return { uiMethod: "embedded", tender: "card", surface: "simply-connect" };
    }

    // BLIK intent: the only supported non-empty embedded payload.
    // { embedded: { paymentMethod: "blik" } } → embedded drop-in rendering BLIK.
    if (
      paymentMethod === "embedded" &&
      optionKeys.length === 1 &&
      optionKeys[0] === "paymentMethod" &&
      methodOptions.paymentMethod === "blik"
    ) {
      return { uiMethod: "embedded", tender: "blik", surface: "simply-connect" };
    }

    throw new PaymentSetupError(PublicPaymentErrorCode.REQUEST_MALFORMED, {
      category: "method_payload_invalid",
      requestedMethod: paymentMethod,
    });
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private tenderFromPayment(payment: Payment): NuveiTender {
    // The CT Payment stores the browser uiMethod (card/blik/embedded), not the
    // tender. "blik" is the only sale-based uiMethod today; everything else
    // (including embedded-BLIK) resolves to the card tender for operations.
    return payment.paymentMethodInfo?.method === "blik" ? "blik" : "card";
  }

  private rejectedModificationForUnsupportedOperation(
    payment: Payment,
  ): PaymentProviderModificationResponse {
    return {
      outcome: PaymentModificationStatus.REJECTED,
      pspReference: payment.interfaceId ?? payment.id,
    };
  }

  private async assertSessionPaymentAccess(
    paymentReference: string,
    sessionToken: string,
    payment: Payment,
  ): Promise<void> {
    if (!paymentHasInteraction(payment, sessionToken)) {
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
    const terminalPaymentTransaction = updateData.transactions.find(
      (tx) => isPaymentTransaction(tx) && (tx.state === "Success" || tx.state === "Failure"),
    );

    if (!terminalPaymentTransaction) {
      return;
    }

    if (!payment.interfaceId) {
      throw new Error("Payment is missing Nuvei session token");
    }

    const statusBody = await nuveiClient().getPaymentStatus({ sessionToken: payment.interfaceId });
    if (terminalPaymentTransaction.state === "Success") {
      if (statusBody.status !== "SUCCESS" || statusBody.transactionStatus !== "APPROVED") {
        throw new Error("Nuvei payment status does not confirm successful DMN");
      }
    } else if (
      statusBody.status !== "SUCCESS" ||
      (statusBody.transactionStatus !== "DECLINED" && statusBody.transactionStatus !== "ERROR")
    ) {
      throw new Error("Nuvei payment status does not confirm failed DMN");
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
    assertNuveiStatusMatchesPayment(statusBody as Record<string, unknown>,
    payment,
    String(dmnClientUniqueId),
    true,);
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
      simplyConnectPaymentMethod: config.simplyConnectPaymentMethod,
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
      dropins: PAYMENT_METHOD_REGISTRY.filter((entry) => entry.kind === "dropin").map(
        (entry) => ({
          type: entry.advertisedType,
        }),
      ),
      components: PAYMENT_METHOD_REGISTRY.filter((entry) => entry.kind === "component").map(
        (entry) => ({
          type: entry.advertisedType,
        }),
      ),
      express: [],
    };
  }

  /**
   * Nuvei settle/void/refund responses report gateway declines with HTTP 200,
   * errCode=0 and status=SUCCESS; the business result lives in transactionStatus
   * (APPROVED / DECLINED / ERROR). Only an explicit APPROVED (or PENDING for
   * asynchronous refunds) may be treated as a successful modification.
   */
  private getNuveiTransactionStatus(response: NuveiTransactionResponse): string {
    const status = response.transactionStatus;
    return typeof status === "string" ? status.toUpperCase() : "";
  }

  private logNuveiModificationResult(
    operation: string,
    paymentId: string,
    response: NuveiTransactionResponse,
    outcome: PaymentModificationStatus,
  ): void {
    const fields = {
      operation,
      paymentId,
      outcome,
      transactionId: response.transactionId,
      transactionStatus: this.getNuveiTransactionStatus(response),
      gwErrorCode: String(response.gwErrorCode ?? ""),
      gwErrorReason: String(response.gwErrorReason ?? ""),
    };

    if (outcome === PaymentModificationStatus.REJECTED) {
      log.warn("Nuvei transaction modification was not approved.", fields);
    } else {
      log.info("Nuvei transaction modification completed.", fields);
    }
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
    if (
      !getTenderStrategy(this.tenderFromPayment(request.payment)).supportedModifications.capture
    ) {
      log.warn("Capture is not supported for this tender.", {
        paymentId: request.payment.id,
      });
      return this.rejectedModificationForUnsupportedOperation(request.payment);
    }

    try {
      const interfaceId =
        this.getTransactionInteractionId(request.payment, PaymentTransactions.AUTHORIZATION) ??
        (request.payment.interfaceId as string);
      const amount = request.amount;
      const formattedAmount = formatAmount(amount);
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

      const outcome =
        this.getNuveiTransactionStatus(response) === "APPROVED"
          ? PaymentModificationStatus.APPROVED
          : PaymentModificationStatus.REJECTED;

      this.logNuveiModificationResult("settleTransaction", request.payment.id, response, outcome);

      return {
        outcome,
        pspReference: response.transactionId || interfaceId,
      };
    } catch (error) {
      log.error("Error capturing payment in Nuvei", {
        error: error instanceof Error ? error.message : String(error),
        paymentId: request.payment.id,
      });
      return {
        outcome: PaymentModificationStatus.REJECTED,
        pspReference: request.payment.interfaceId ?? request.payment.id,
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
    if (
      !getTenderStrategy(this.tenderFromPayment(request.payment)).supportedModifications.cancel
    ) {
      log.warn("Cancel is not supported for this tender.", {
        paymentId: request.payment.id,
      });
      return this.rejectedModificationForUnsupportedOperation(request.payment);
    }

    try {
      const interfaceId =
        this.getTransactionInteractionId(request.payment, PaymentTransactions.AUTHORIZATION) ??
        (request.payment.interfaceId as string);
      const amount = request.payment.amountPlanned;
      const formattedAmount = formatAmount(amount);
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

      const outcome =
        this.getNuveiTransactionStatus(response) === "APPROVED"
          ? PaymentModificationStatus.APPROVED
          : PaymentModificationStatus.REJECTED;

      this.logNuveiModificationResult("voidTransaction", request.payment.id, response, outcome);

      return {
        outcome,
        pspReference: response.transactionId || interfaceId,
      };
    } catch (error) {
      log.error("Error canceling payment in Nuvei", {
        error: error instanceof Error ? error.message : String(error),
        paymentId: request.payment.id,
      });
      return {
        outcome: PaymentModificationStatus.REJECTED,
        pspReference: request.payment.interfaceId ?? request.payment.id,
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
      const chargeInteractionId = this.getTransactionInteractionId(
        request.payment,
        PaymentTransactions.CHARGE,
      );
      const tenderSupportsCapture = getTenderStrategy(
        this.tenderFromPayment(request.payment),
      ).supportedModifications.capture;
      if (!tenderSupportsCapture && !request.transactionId && !chargeInteractionId) {
        log.warn("Refund is not supported for this tender before a Charge transaction.", {
          paymentId: request.payment.id,
        });
        return this.rejectedModificationForUnsupportedOperation(request.payment);
      }
      const interfaceId =
        request.transactionId ??
        chargeInteractionId ??
        (request.payment.interfaceId as string);
      const amount = request.amount;
      const formattedAmount = formatAmount(amount);
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

      const transactionStatus = this.getNuveiTransactionStatus(response);
      const outcome =
        transactionStatus === "APPROVED" || transactionStatus === "PENDING"
          ? PaymentModificationStatus.RECEIVED
          : PaymentModificationStatus.REJECTED;

      this.logNuveiModificationResult("refundTransaction", request.payment.id, response, outcome);

      return {
        outcome,
        pspReference: response.transactionId || interfaceId,
      };
    } catch (error) {
      log.error("Error refunding payment in Nuvei", {
        error: error instanceof Error ? error.message : String(error),
        paymentId: request.payment.id,
      });
      return {
        outcome: PaymentModificationStatus.REJECTED,
        pspReference: request.payment.interfaceId ?? request.payment.id,
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
   * Lock the cart before any payment processing by freezing it (HardFreeze:
   * prices, discounts, and shipping are pinned; the cart total cannot change
   * between openOrder and reconciliation). Frozen carts still accept
   * addPayment and can be ordered.
   *
   * Idempotent: an already-frozen cart (retry, second payment attempt, or a
   * freeze applied by Checkout) is accepted as-is. Non-active carts
   * (Ordered/Merged) are rejected.
   */
  private async lockCartForPayment(cart: Cart): Promise<{ cart: Cart; frozenByUs: boolean }> {
    if (cart.cartState === "Frozen") {
      log.info("Cart already frozen; continuing with existing lock.", { cartId: cart.id });
      return { cart, frozenByUs: false };
    }
    if (cart.cartState !== "Active") {
      throw new PaymentSetupError(
        PublicPaymentErrorCode.CART_NOT_LOCKABLE,
        { cartId: cart.id, cartState: cart.cartState },
        409,
      );
    }

    const freeze = (version: number) =>
      this.ctCartClient
        .carts()
        .withId({ ID: cart.id })
        .post({ body: { version, actions: [{ action: "freezeCart", strategy: "HardFreeze" }] } })
        .execute();

    try {
      const response = await freeze(cart.version);
      log.info("Cart frozen for payment.", { cartId: cart.id });
      return { cart: response.body, frozenByUs: true };
    } catch (initialError) {
      // One retry on version conflict: refetch; if a concurrent actor froze the
      // cart we accept it, otherwise retry the freeze with the fresh version.
      const latest = await this.ctCartService.getCart({ id: cart.id });
      if (latest.cartState === "Frozen") {
        log.info("Cart frozen concurrently; continuing with existing lock.", { cartId: cart.id });
        return { cart: latest, frozenByUs: false };
      }
      if (latest.cartState !== "Active") {
        throw new PaymentSetupError(
          PublicPaymentErrorCode.CART_NOT_LOCKABLE,
          { cartId: cart.id, cartState: latest.cartState },
          409,
        );
      }
      log.warn("Cart freeze failed; retrying once with fresh version.", {
        cartId: cart.id,
        error: initialError instanceof Error ? initialError.message : String(initialError),
      });
      const response = await freeze(latest.version);
      log.info("Cart frozen for payment.", { cartId: cart.id });
      return { cart: response.body, frozenByUs: true };
    }
  }

  /**
   * Best-effort unfreeze for failure paths where THIS request froze the cart
   * but payment session setup did not complete — without this the shopper
   * would be stuck with an immutable cart and no payment in flight.
   */
  private async unfreezeCartBestEffort(cartId: string): Promise<void> {
    try {
      const latest = await this.ctCartClient.carts().withId({ ID: cartId }).get().execute();
      if (latest.body.cartState !== "Frozen") return;
      await this.ctCartClient
        .carts()
        .withId({ ID: cartId })
        .post({ body: { version: latest.body.version, actions: [{ action: "unfreezeCart" }] } })
        .execute();
      log.info("Cart unfrozen after payment session failure.", { cartId });
    } catch (error) {
      log.warn("Failed to unfreeze cart after payment session failure; manual unfreeze may be required.", {
        cartId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    let frozenByUs = false;
    try {
      const fetchedCart = await this.ctCartService.getCart({ id: transactionDraft.cartId });

      // Lock the cart before any payment processing.
      const lock = await this.lockCartForPayment(fetchedCart);
      const cart = lock.cart;
      frozenByUs = lock.frozenByUs;

      const amountPlanned =
        transactionDraft.amount ?? (await this.ctCartService.getPaymentAmount({ cart }));

      const formattedAmount = formatAmount(amountPlanned);

      log.info("Opening Nuvei order for transaction.", {
        cartId: cart.id,
        amount: formattedAmount,
        currency: amountPlanned.currencyCode,
      });

      const notificationUrl = this.getDmnNotificationUrl();
      const shopperDetails = this.cartShopperDetails(cart);
      const openOrderResponse = await nuveiClient().openOrder({
        amount: formattedAmount,
        currency: amountPlanned.currencyCode,
        clientUniqueId: cart.id,
        ...(notificationUrl && { urlDetails: { notificationUrl } }),
        ...(shopperDetails && { billingAddress: shopperDetails, userDetails: shopperDetails }),
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
      if (frozenByUs) {
        await this.unfreezeCartBestEffort(transactionDraft.cartId);
      }
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
  public async createPaymentSession(options?: unknown): Promise<PaymentSessionResponse> {
    let frozenByUs = false;
    let lockedCartId: string | undefined;
    try {
      const selection = this.validatePaymentMethodOptions(options);
      const cartId = getCartIdFromContext();
      const fetchedCart = await this.ctCartService.getCart({ id: cartId });

      // Lock the cart before any payment processing: the amount sent to Nuvei
      // is computed from the frozen cart and can no longer drift.
      const lock = await this.lockCartForPayment(fetchedCart);
      const cart = lock.cart;
      frozenByUs = lock.frozenByUs;
      lockedCartId = cart.id;

      const amountPlanned = await this.ctCartService.getPaymentAmount({ cart });
      const formattedAmount = formatAmount(amountPlanned);

      log.info("Creating Nuvei payment session via openOrder.", {
        cartId: cart.id,
        amount: formattedAmount,
        currency: amountPlanned.currencyCode,
        uiMethod: selection.uiMethod,
        paymentMethod: selection.tender,
      });

      const notificationUrl = this.getDmnNotificationUrl();
      const shopperDetails = this.cartShopperDetails(cart);
      getTenderStrategy(selection.tender).validateSessionPrerequisites({
        cart,
        amountPlanned,
        shopperDetails,
        surface: selection.surface,
      });
      const openOrderResponse = await nuveiClient().openOrder({
        amount: formattedAmount,
        currency: amountPlanned.currencyCode,
        clientUniqueId: cart.id,
        ...(notificationUrl && { urlDetails: { notificationUrl } }),
        ...(shopperDetails && { billingAddress: shopperDetails, userDetails: shopperDetails }),
      });

      const sessionToken = openOrderResponse.sessionToken;

      const paymentReference = await this.paymentCreationService.handleCtPaymentCreation({
        interactionId: sessionToken,
        amountPlanned,
        cart,
        paymentMethod: selection.uiMethod,
        tender: selection.tender,
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
        uiMethod: selection.uiMethod,
        paymentMethod: selection.tender,
        integrationSurface: selection.surface,
        ...(shopperDetails?.country && { countryCode: shopperDetails.country }),
      };
    } catch (error) {
      if (frozenByUs && lockedCartId) {
        await this.unfreezeCartBestEffort(lockedCartId);
      }
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
   * CT terminal payment transactions prefer Nuvei PPP identity when available.
   * If getPaymentStatus returns terminal approval/decline without PPP, we still
   * commit the final result using Nuvei transactionId, or the already-bound
   * session token as the last stable idempotency key.
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

    const existingTerminalOutcome = getExistingTerminalOutcome(ctPayment);
    if (existingTerminalOutcome) {
      log.info(
        "CT terminal payment transaction already recorded – short-circuiting Nuvei status lookup.",
        {
          paymentReference,
          outcome: existingTerminalOutcome,
        },
      );
      return { outcome: existingTerminalOutcome };
    }

    const paymentStatus = await nuveiClient().getPaymentStatus({ sessionToken });
    const statusBody = paymentStatus as Record<string, unknown>;
    const outcome = classifyNuveiStatus(statusBody.status, statusBody.transactionStatus);
    const cartId = getCartIdFromContext();
    const requireFinancial = outcome === "approved";
    assertNuveiStatusMatchesPayment(statusBody, ctPayment, cartId, requireFinancial);

    if (outcome === "pending") {
      log.info("Payment status is pending/inconclusive – no CT terminal write.", {
        paymentReference,
        status: String(statusBody.status ?? ""),
        transactionStatus: String(statusBody.transactionStatus ?? ""),
      });
      return { outcome: "pending" };
    }

    const terminalIdentity = extractNuveiTerminalIdentity(statusBody, sessionToken);
    const transactionState: "Success" | "Failure" = outcome === "approved" ? "Success" : "Failure";

    const terminalTransactionType = getConfirmTerminalTransactionType(statusBody);
    const alreadyRecorded = hasTerminalTransaction(ctPayment, {
      type: terminalTransactionType,
      state: transactionState,
      interactionId: terminalIdentity.interactionId,
    });

    if (alreadyRecorded) {
      log.info("Terminal payment transaction already recorded – short-circuiting.", {
        paymentReference,
        interactionId: terminalIdentity.interactionId,
        identitySource: terminalIdentity.source,
        outcome,
      });
      return { outcome };
    }

    log.info("Writing CT terminal payment transaction.", {
      paymentReference,
      transactionType: terminalTransactionType,
      interactionId: terminalIdentity.interactionId,
      identitySource: terminalIdentity.source,
      state: transactionState,
    });

    await this.ctPaymentService.updatePayment({
      id: ctPayment.id,
      pspReference: terminalIdentity.pspReference,
      transaction: {
        type: terminalTransactionType,
        amount: ctPayment.amountPlanned,
        state: transactionState,
        interactionId: terminalIdentity.interactionId,
      },
    });

    return { outcome };
  }

  private getOptionalDmnString(body: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = body[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  /**
   * DMN delivery target for this deployment. Passing urlDetails.notificationUrl
   * on openOrder removes the dependency on manual per-site DMN configuration in
   * the Nuvei control panel.
   */
  private getDmnNotificationUrl(): string | undefined {
    const serviceUrl = getConfig().serviceUrl;
    if (!serviceUrl) return undefined;
    return `${serviceUrl.replace(/\/+$/, "")}/webhooks/nuvei`;
  }

  /**
   * Shopper contact details for openOrder, taken from the cart. Pre-filling
   * them on the Nuvei order satisfies the gateway's mandatory-field rules
   * (gateway error 1136 "Mandatory fields are missing") for Web SDK payments,
   * whose browser payload only carries what the enabler knows — commercetools
   * Checkout does not pass the shopper email to enablers.
   */
  private cartShopperDetails(cart: Cart): OpenOrderBillingAddress | undefined {
    const address = cart.billingAddress ?? cart.shippingAddress;
    const email = address?.email ?? cart.customerEmail ?? undefined;
    const country = address?.country;
    if (!email && !country) return undefined;

    return {
      ...(email && { email }),
      ...(country && { country }),
      ...(address?.firstName && { firstName: address.firstName }),
      ...(address?.lastName && { lastName: address.lastName }),
    };
  }

  /**
   * Whitelisted, non-sensitive DMN correlation fields safe for structured logs.
   * Never log the raw DMN body: it carries checksums, shopper PII, and card metadata.
   */
  private getDmnLogFields(body: Record<string, unknown>): Record<string, string> {
    return {
      merchantId: String(body.merchant_id ?? body.merchantId ?? ""),
      transactionType: String(body.transactionType ?? ""),
      pppStatus: String(body.ppp_status ?? ""),
      status: String(body.Status ?? body.status ?? ""),
      pppTransactionId: String(
        body.PPP_TransactionID ?? body.PPP_TransactionId ?? body.ppp_TransactionID ?? "",
      ),
      transactionId: String(body.TransactionID ?? body.transactionId ?? ""),
      merchantUniqueId: String(body.merchant_unique_id ?? ""),
      clientUniqueId: String(body.clientUniqueId ?? ""),
      totalAmount: String(body.totalAmount ?? ""),
      currency: String(body.currency ?? ""),
    };
  }

  /**
   * A DMN without any transaction identity, type, amount, or payment
   * reference carries nothing to reconcile against a Payment (typically a
   * request-level ping with only ppp_status set). Its checksum fields are
   * absent, so validation can never succeed either. A DMN that references a
   * payment (merchant_unique_id / clientUniqueId / sessionToken) is NOT a
   * ping — malformed ones must keep failing loudly.
   */
  private isNonTransactionDmn(body: Record<string, unknown>): boolean {
    const present = (value: unknown): boolean =>
      typeof value === "string" ? value.length > 0 : value != null;

    return (
      !present(body.PPP_TransactionID) &&
      !present(body.PPP_TransactionId) &&
      !present(body.TransactionID) &&
      !present(body.transactionId) &&
      !present(body.transactionType) &&
      !present(body.totalAmount) &&
      !present(body.merchant_unique_id) &&
      !present(body.clientUniqueId) &&
      !present(body.sessionToken)
    );
  }

  private isResourceNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const maybeError = error as Error & {
      code?: unknown;
      httpErrorStatus?: unknown;
      statusCode?: unknown;
    };

    return (
      maybeError.code === "ResourceNotFound" ||
      maybeError.httpErrorStatus === 404 ||
      maybeError.statusCode === 404 ||
      /Resource with ID .* was not found/i.test(error.message)
    );
  }

  private getDmnPlannedAmount(body: Record<string, unknown>): { centAmount: number; currencyCode: string } | undefined {
    const currencyCode = this.getOptionalDmnString(body, ["currency"]);
    if (!currencyCode || body.totalAmount === undefined) {
      return undefined;
    }

    return {
      centAmount: parseAmountToCentAmount(body.totalAmount, currencyCode),
      currencyCode,
    };
  }

  private hasNuveiSessionBinding(payment: Payment): boolean {
    return (
      typeof payment.interfaceId === "string" &&
      payment.interfaceId.length > 0 &&
      (payment.transactions ?? []).some(
        (transaction) => transaction.interactionId === payment.interfaceId,
      )
    );
  }

  private async isNuveiVerifiedSessionBoundPayment(
    payment: Payment,
    cartId: string,
  ): Promise<boolean> {
    if (!this.hasNuveiSessionBinding(payment)) return false;

    const sessionToken = payment.interfaceId as string;
    try {
      const statusBody = (await withAbortTimeout(
        (signal) => nuveiClient().getPaymentStatus({ sessionToken, signal }),
        DMN_SESSION_VERIFICATION_TIMEOUT_MS,
        "Nuvei session verification timed out",
      )) as Record<string, unknown>;

      if (statusBody.sessionToken !== undefined && statusBody.sessionToken !== sessionToken) {
        return false;
      }

      if (statusBody.clientUniqueId === undefined || String(statusBody.clientUniqueId) !== cartId) {
        return false;
      }

      assertNuveiStatusMatchesPayment(statusBody, payment, cartId, false);
      return true;
    } catch (error) {
      log.warn("Ignoring cart-linked Payment that did not verify as a Nuvei session.", {
        cartId,
        paymentId: payment.id,
        reason: error instanceof Error ? error.name : typeof error,
      });
      return false;
    }
  }

  private async getNuveiVerifiedSessionBoundPayments(
    payments: Payment[],
    cartId: string,
  ): Promise<Payment[]> {
    if (payments.length > MAX_SESSION_BOUND_DMN_CANDIDATES) {
      throw new Error("Too many session-bound Payments found for DMN cart reference");
    }

    const verified = await Promise.all(
      payments.map(async (payment) =>
        (await this.isNuveiVerifiedSessionBoundPayment(payment, cartId)) ? payment : undefined,
      ),
    );

    return verified.filter((payment): payment is Payment => payment !== undefined);
  }

  private isNuveiPayment(payment: Payment): boolean {
    return payment.paymentMethodInfo?.paymentInterface === NUVEI_PAYMENT_INTERFACE;
  }

  private paymentMatchesDmnAmount(
    payment: Payment,
    dmnAmount: { centAmount: number; currencyCode: string } | undefined,
  ): boolean {
    if (!dmnAmount) return true;
    return (
      payment.amountPlanned.centAmount === dmnAmount.centAmount &&
      payment.amountPlanned.currencyCode === dmnAmount.currencyCode
    );
  }

  private getCartPaymentIds(cart: Cart): string[] {
    return (cart.paymentInfo?.payments ?? [])
      .map((paymentRef) => paymentRef.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  private getPaymentsMatchingDmnTransactionIdentity(
    payments: Payment[],
    body: Record<string, unknown>,
  ): Payment[] {
    const transactionIdentities = extractNuveiTransactionIdentities(body);
    if (transactionIdentities.length === 0) return [];

    return payments.filter((payment) =>
      (payment.transactions ?? []).some(
        (transaction) =>
          transaction.interactionId !== undefined &&
          transactionIdentities.includes(transaction.interactionId),
      ),
    );
  }

  private getPaymentsWithExistingTerminalOutcome(payments: Payment[]): Payment[] {
    return payments.filter((payment) => getExistingTerminalOutcome(payment) !== undefined);
  }

  private async resolveDmnPaymentFromCartId(
    cartId: string,
    body: Record<string, unknown>,
  ): Promise<Payment | undefined> {
    let cart: Cart;
    try {
      cart = await this.ctCartService.getCart({ id: cartId });
    } catch (error) {
      if (this.isResourceNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }

    const paymentIds = this.getCartPaymentIds(cart);
    if (paymentIds.length === 0) {
      return undefined;
    }

    const dmnAmount = this.getDmnPlannedAmount(body);
    const paymentResults = await Promise.allSettled(
      paymentIds.map((id) => this.ctPaymentService.getPayment({ id })),
    );
    const payments: Payment[] = [];
    for (const result of paymentResults) {
      if (result.status === "fulfilled") {
        payments.push(result.value);
        continue;
      }
      if (!this.isResourceNotFoundError(result.reason)) {
        throw result.reason;
      }
    }
    if (payments.length === 0) {
      return undefined;
    }
    const amountMatches = payments.filter((payment) =>
      this.paymentMatchesDmnAmount(payment, dmnAmount),
    );
    const staticNuveiCandidates = amountMatches.filter((payment) => this.isNuveiPayment(payment));
    const sessionBoundCandidates = amountMatches.filter(
      (payment) => !this.isNuveiPayment(payment) && this.hasNuveiSessionBinding(payment),
    );
    // Prefer statically identified connector Payments. Session-bound verification is a
    // bounded fallback for Checkout-session interface IDs and must not let unrelated
    // cart-linked session candidates block an already identifiable Nuvei Payment.
    const verifiedSessionBoundCandidates =
      staticNuveiCandidates.length === 0
        ? await this.getNuveiVerifiedSessionBoundPayments(sessionBoundCandidates, cartId)
        : [];
    const candidates = [...staticNuveiCandidates, ...verifiedSessionBoundCandidates];

    if (candidates.length === 0) {
      return undefined;
    }

    const identityMatches = this.getPaymentsMatchingDmnTransactionIdentity(candidates, body);
    if (identityMatches.length === 1) {
      log.warn("DMN merchant_unique_id resolved as cart ID and matched an existing transaction.", {
        cartId,
        paymentId: identityMatches[0].id,
      });
      return identityMatches[0];
    }

    if (identityMatches.length > 1) {
      throw new Error("Multiple candidate Nuvei Payments matched DMN transaction identity");
    }

    const terminalMatches = this.getPaymentsWithExistingTerminalOutcome(candidates);
    if (terminalMatches.length === 1) {
      log.warn("DMN merchant_unique_id resolved as cart ID and matched an existing terminal Payment.", {
        cartId,
        paymentId: terminalMatches[0].id,
      });
      return terminalMatches[0];
    }

    if (terminalMatches.length > 1) {
      throw new Error("Multiple terminal Nuvei Payments found for DMN cart reference");
    }

    if (candidates.length > 1) {
      throw new Error("Multiple candidate Nuvei Payments found for DMN cart reference");
    }

    log.warn("DMN merchant_unique_id resolved as cart ID; using linked Nuvei Payment.", {
      cartId,
      paymentId: candidates[0].id,
    });

    return candidates[0];
  }

  private async resolveDmnPayment(body: Record<string, unknown>): Promise<Payment> {
    const merchantUniqueId = this.getOptionalDmnString(body, ["merchant_unique_id"]);
    const sessionToken = this.getOptionalDmnString(body, [
      "sessionToken",
      "session_token",
      "SessionToken",
      "sessionId",
      "session_id",
      "SessionId",
    ]);

    let resolvedFromCartId = false;

    if (merchantUniqueId) {
      let payment: Payment | undefined;
      try {
        payment = await this.ctPaymentService.getPayment({ id: merchantUniqueId });
        if (payment) {
          log.info("Resolved DMN Payment by merchant_unique_id Payment id.", {
            resolutionPath: "direct-payment-id",
            merchantUniqueId,
            paymentId: payment.id,
          });
        }
      } catch (error) {
        if (this.isResourceNotFoundError(error)) {
          payment = await this.resolveDmnPaymentFromCartId(merchantUniqueId, body);
          resolvedFromCartId = payment !== undefined;
          if (payment) {
            log.info("Resolved DMN Payment by cart payment link.", {
              resolutionPath: "cart-payment-link",
              merchantUniqueId,
              paymentId: payment.id,
            });
          } else if (sessionToken) {
            log.warn("DMN merchant_unique_id did not resolve to a Payment or cart; falling back to session token.", {
              resolutionPath: "session-token-fallback",
              merchantUniqueId,
            });
          } else {
            log.warn("DMN merchant_unique_id did not resolve to a Payment or cart and no session token fallback is available.", {
              resolutionPath: "unresolved",
              merchantUniqueId,
            });
          }
        } else {
          throw error;
        }
      }

      if (payment) {
        if (sessionToken && !resolvedFromCartId && payment.interfaceId !== sessionToken) {
          throw new Error("DMN session token does not match merchant_unique_id payment");
        }
        if (sessionToken && resolvedFromCartId && payment.interfaceId !== sessionToken) {
          log.warn("DMN cart-id resolution ignored non-matching session token.", {
            resolutionPath: "cart-payment-link",
            merchantUniqueId,
            paymentId: payment.id,
          });
        }
        return payment;
      }
    } else if (!sessionToken) {
      log.warn("DMN is missing merchant_unique_id and session token.", {
        resolutionPath: "unresolved",
      });
      throw new Error("Missing merchant_unique_id in DMN body");
    }

    if (!sessionToken) {
      throw new Error("Missing DMN session token for Payment fallback");
    }

    const payments = await this.ctPaymentService.findPaymentsByInterfaceId({
      interfaceId: sessionToken,
    });

    if (payments.length === 0) {
      log.warn("DMN session token fallback did not resolve to a Payment.", {
        resolutionPath: "unresolved",
        merchantUniqueId,
      });
      throw new Error("No Payment found for DMN session token");
    }

    if (payments.length > 1) {
      throw new Error("Multiple Payments found for DMN session token");
    }

    log.info("Resolved DMN Payment by session token fallback.", {
      resolutionPath: "session-token-fallback",
      merchantUniqueId,
      paymentId: payments[0].id,
    });

    return payments[0];
  }

  /**
   * Process a Nuvei DMN (Direct Merchant Notification) webhook.
   *
   * The method runs an ordered gate pipeline before any CT Payment write.
   * Each gate is positioned so that earlier (cheaper, more certain) checks
   * short-circuit before later (more expensive, more specific) ones:
   *
   *   1. Non-transaction filter  — acknowledge pings that carry no transaction data.
   *   2. Checksum validation     — reject unsigned/tempered payloads.
   *   3. Merchant config match   — reject DMNs for other merchants.
   *   4. Payment resolution      — resolve CT Payment by merchant_unique_id, cart-id, or session token.
   *   5. PPP dedup               — skip if a terminal transaction with the same PPP already exists.
   *   6. Non-terminal ack        — acknowledge PENDING Auth/Charge DMNs without a CT write so a
   *                                later approved DMN is not blocked by a Pending transaction.
   *   7. Terminal-already-recorded — skip if the exact terminal transaction (type + state + PPP) is on the Payment.
   *   8. Conflicting-terminal guard — skip if the Payment already has a different terminal outcome.
   *   9. Nuvei status cross-check — call getPaymentStatus to confirm the DMN outcome before writing.
   *
   * Only after all gates pass does the method write transactions to the CT Payment.
   *
   * @param body - The DMN request body
   */
  public async processNuveiDmn(body: Record<string, unknown>): Promise<void> {
    const config = getConfig();

    log.info("Processing Nuvei DMN.", this.getDmnLogFields(body));

    // Nuvei also delivers non-transaction notifications (request-level pings
    // carrying only ppp_status) whose checksum fields are absent, so they can
    // never validate. They carry nothing to reconcile: acknowledge them so
    // Nuvei stops retrying instead of hammering the endpoint with 400s.
    if (this.isNonTransactionDmn(body)) {
      log.info("Ignoring non-transaction DMN notification.", this.getDmnLogFields(body));
      return;
    }

    const isValid = nuveiClient().validateDmnChecksum(body, config.nuveiDmnChecksumAlgorithm);
    if (!isValid) {
      log.warn("DMN checksum validation failed.", this.getDmnLogFields(body));
      throw new DmnChecksumInvalidError();
    }

    this.assertDmnMatchesConfig(body);

    const ctPayment = await this.resolveDmnPayment(body);
    const paymentId = ctPayment.id;
    const bodyForConversion = { ...body, merchant_unique_id: paymentId };

    log.info("Resolved DMN to CT Payment.", {
      paymentId,
      transactionType: String(body.transactionType),
      pppStatus: String(body.ppp_status),
    });

    const dmnPpp = extractCanonicalPpp(bodyForConversion);
    if (
      dmnPpp &&
      (ctPayment.transactions ?? []).some(
        (tx) =>
          tx.interactionId === dmnPpp && (tx.state === "Success" || tx.state === "Failure"),
      )
    ) {
      log.info("DMN already processed (terminal PPP duplicate), skipping.", {
        paymentId,
        ppp: dmnPpp,
      });
      return;
    }

    const updateData = this.nuveiEventConverter.convertDmnToPaymentUpdate(
      bodyForConversion,
      ctPayment.amountPlanned?.centAmount,
    );
    this.assertDmnUpdateMatchesPayment(updateData, ctPayment);

    if (dmnHasNonTerminalPaymentTransaction(updateData)) {
      log.info("Acknowledging non-terminal DMN without CT Payment update.", {
        paymentId,
        pspReference: updateData.pspReference,
      });
      return;
    }

    if (dmnTerminalTransactionAlreadyRecorded(updateData, ctPayment)) {
      log.info("DMN terminal transaction already recorded, skipping.", {
        paymentId,
        pspReference: updateData.pspReference,
      });
      return;
    }
    const existingTerminalOutcome = getExistingTerminalOutcome(ctPayment);
    const incomingTerminalOutcome = dmnTerminalPaymentOutcome(updateData);
    if (existingTerminalOutcome && incomingTerminalOutcome) {
      if (existingTerminalOutcome !== incomingTerminalOutcome) {
        log.warn("Ignoring conflicting terminal DMN for Payment with existing terminal outcome.", {
          paymentId,
          pspReference: updateData.pspReference,
          existingOutcome: existingTerminalOutcome,
          incomingOutcome: incomingTerminalOutcome,
        });
      } else {
        log.info("DMN outcome matches existing terminal outcome, skipping.", {
          paymentId,
          pspReference: updateData.pspReference,
          outcome: incomingTerminalOutcome,
        });
      }
      return;
    }
    await this.assertDmnMatchesNuveiStatus(updateData, ctPayment, bodyForConversion);

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
