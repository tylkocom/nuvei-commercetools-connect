import type {
  CommercetoolsCartService,
  CommercetoolsPaymentService,
} from "@commercetools/connect-payments-sdk";
import type { Cart, Payment } from "@commercetools/platform-sdk";
import { getConfig } from "../config/config.js";
import { nuveiClient } from "../clients/nuvei.client.js";
import { log } from "../libs/logger/index.js";
import { PaymentTransactions } from "../dtos/operations/payment-intents.dto.js";
import { NUVEI_PAYMENT_INTERFACE } from "../constants.js";
import { nuveiPaymentKeyFromOrder } from "./nuvei-payment-key.js";
import { NuveiEventConverter } from "./converters/nuvei-event.converter.js";
import type { NuveiDmnUpdateData } from "./converters/nuvei-event.converter.js";
import {
  dmnHasNonTerminalPaymentTransaction,
  dmnTerminalPaymentOutcome,
  dmnTerminalTransactionAlreadyRecorded,
  getExistingTerminalOutcome,
} from "./payment-state.js";
import {
  triggerOrderPaymentStateSync,
  type OrderPaymentStateSyncer,
} from "./order-payment-state.service.js";
import {
  assertNuveiStatusMatchesPayment,
  extractCanonicalPpp,
  extractNuveiTransactionIdentities,
  parseAmountToCentAmount,
} from "./nuvei-status.js";

export class DmnChecksumInvalidError extends Error {
  public constructor() {
    super("Invalid DMN checksum");
  }
}

const MAX_SESSION_BOUND_DMN_CANDIDATES = 3;
const DMN_SESSION_VERIFICATION_TIMEOUT_MS = 3_000;

function withAbortTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
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

/**
 * Minimal structural slice of the platform SDK ByProjectKeyRequestBuilder used to
 * fetch a Payment by key. Structurally satisfied by paymentSDK.ctAPI.client and
 * trivially mockable in tests.
 */
export type CommercetoolsPaymentClient = {
  payments: () => {
    withKey: (arg: { key: string }) => {
      get: () => { execute: () => Promise<{ body: Payment }> };
    };
  };
};

type NuveiDmnReconcilerOptions = {
  ctCartService: CommercetoolsCartService;
  ctPaymentService: CommercetoolsPaymentService;
  ctPaymentClient?: CommercetoolsPaymentClient;
  orderPaymentStateSync?: OrderPaymentStateSyncer;
};

/**
 * Reconciles Nuvei DMN (Direct Merchant Notification) webhooks into
 * commercetools Payment transactions. Owns the full DMN gate pipeline:
 * non-transaction filtering, checksum validation, merchant/config match,
 * payment resolution (by merchant_unique_id, cart link, or session token),
 * idempotency, and the final transaction write.
 *
 * Extracted from NuveiPaymentService so the facade stays focused on session
 * creation, confirmation, and payment operations.
 */
export class NuveiDmnReconciler {
  private readonly ctCartService: CommercetoolsCartService;
  private readonly ctPaymentService: CommercetoolsPaymentService;
  private readonly ctPaymentClient?: CommercetoolsPaymentClient;
  private readonly orderPaymentStateSync?: OrderPaymentStateSyncer;
  private readonly nuveiEventConverter = new NuveiEventConverter();

  public constructor(opts: NuveiDmnReconcilerOptions) {
    this.ctCartService = opts.ctCartService;
    this.ctPaymentService = opts.ctPaymentService;
    this.ctPaymentClient = opts.ctPaymentClient;
    this.orderPaymentStateSync = opts.orderPaymentStateSync;
  }

  /**
   * Process a Nuvei DMN webhook.
   *
   * Runs an ordered gate pipeline before any CT Payment write. Each gate is
   * positioned so cheaper, more certain checks short-circuit before more
   * expensive, more specific ones:
   *   1. Non-transaction filter  — acknowledge pings carrying no transaction data.
   *   2. Checksum validation     — reject unsigned/tempered payloads.
   *   3. Merchant config match   — reject DMNs for other merchants.
   *   4. Payment resolution      — resolve by merchant_unique_id, cart-id, or session token.
   *   5. PPP dedup               — skip if a terminal transaction with the same PPP exists.
   *   6. Non-terminal ack        — acknowledge PENDING Auth/Charge DMNs without a CT write.
   *   7. Terminal-already-recorded — skip if the exact terminal transaction is on the Payment.
   *   8. Conflicting-terminal guard — skip if the Payment already has a different terminal outcome.
   *   9. Nuvei status cross-check — call getPaymentStatus to confirm the DMN outcome before writing.
   */
  public async process(body: Record<string, unknown>): Promise<void> {
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
    const duplicateTerminalTx = dmnPpp
      ? (ctPayment.transactions ?? []).find(
          (tx) => tx.interactionId === dmnPpp && (tx.state === "Success" || tx.state === "Failure"),
        )
      : undefined;
    if (duplicateTerminalTx) {
      log.info("DMN already processed (terminal PPP duplicate), skipping.", {
        paymentId,
        ppp: dmnPpp,
      });
      // Repair: an earlier attempt may have recorded the charge before the Order existed.
      if (
        duplicateTerminalTx.state === "Success" &&
        (duplicateTerminalTx.type === PaymentTransactions.AUTHORIZATION ||
          duplicateTerminalTx.type === PaymentTransactions.CHARGE)
      ) {
        triggerOrderPaymentStateSync(this.orderPaymentStateSync, paymentId);
      }
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
      if (dmnTerminalPaymentOutcome(updateData) === "approved") {
        triggerOrderPaymentStateSync(this.orderPaymentStateSync, paymentId);
      }
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
        if (incomingTerminalOutcome === "approved") {
          triggerOrderPaymentStateSync(this.orderPaymentStateSync, paymentId);
        }
      }
      return;
    }
    await this.assertDmnMatchesNuveiStatus(updateData, ctPayment, bodyForConversion);

    const paymentMethodInfo: { method?: string; name?: { en: string } } = {
      ...(updateData.paymentMethod && { method: updateData.paymentMethod }),
      ...(updateData.paymentMethodName && { name: updateData.paymentMethodName }),
    };
    const hasPaymentMethodInfo = Object.keys(paymentMethodInfo).length > 0;

    if (updateData.transactions.length === 0) {
      throw new Error("DMN update produced no transaction to write");
    }

    // Apply the terminal transaction(s) and paymentMethodInfo in one atomic
    // updatePayment so a retried DMN either records everything (caught by the
    // already-recorded gate above) or nothing — no window where the terminal
    // transaction exists but method/name is left unset.
    for (const [index, transaction] of updateData.transactions.entries()) {
      await this.ctPaymentService.updatePayment({
        id: paymentId,
        pspReference: updateData.pspReference,
        transaction,
        ...(index === 0 && hasPaymentMethodInfo && { paymentMethodInfo }),
      });
    }

    if (incomingTerminalOutcome === "approved") {
      triggerOrderPaymentStateSync(this.orderPaymentStateSync, paymentId);
    }

    if (updateData.interfaceCode) {
      log.info("DMN interfaceCode determined.", {
        paymentId,
        interfaceCode: updateData.interfaceCode,
      });
    }

    log.info("DMN processed successfully.", {
      paymentId,
      transactionId: updateData.pspReference,
      interfaceCode: updateData.interfaceCode,
    });
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

    // Preferred path: the DMN's PPP_TransactionID is the openOrder orderId, and the
    // Payment was created with key `nuvei-<orderId>`. One lookup, independent of how
    // many sibling Payments (card/BLIK mounts, retries) are linked to the cart.
    const keyedPayment = await this.resolveDmnPaymentByNuveiKey(body, sessionToken);
    if (keyedPayment) {
      return keyedPayment;
    }

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
   * Resolves the Payment created for this Nuvei order via its deterministic key.
   * Returns undefined (so the legacy paths run) when the client is not wired, the
   * DMN carries no PPP id, or no Payment has that key — e.g. Payments created
   * before keys were introduced, or settle/refund DMNs whose PPP id is not an
   * openOrder id.
   */
  private async resolveDmnPaymentByNuveiKey(
    body: Record<string, unknown>,
    sessionToken: string | undefined,
  ): Promise<Payment | undefined> {
    if (!this.ctPaymentClient) return undefined;

    const pppTransactionId = extractCanonicalPpp(body);
    const key = nuveiPaymentKeyFromOrder(pppTransactionId);
    if (!pppTransactionId || !key) return undefined;

    let payment: Payment;
    try {
      payment = (await this.ctPaymentClient.payments().withKey({ key }).get().execute()).body;
    } catch (error) {
      if (this.isResourceNotFoundError(error)) return undefined;
      throw error;
    }

    if (sessionToken && payment.interfaceId !== sessionToken) {
      throw new Error("DMN session token does not match Nuvei order key payment");
    }

    log.info("Resolved DMN Payment by Nuvei order key.", {
      resolutionPath: "nuvei-order-key",
      pppTransactionId,
      paymentId: payment.id,
    });
    return payment;
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
        ? await this.verifySessionBoundCandidatesPreferringIdentity(
            sessionBoundCandidates,
            cartId,
            body,
          )
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
    if (merchantId === undefined && merchantSiteId === undefined) {
      // The checksum is the real integrity gate (HMAC'd with the merchant
      // secret), so a DMN omitting both merchant fields is not trusted on that
      // basis alone. Surface it for monitoring: a DMN identifying no merchant
      // is unusual and worth flagging even though it is not rejected here.
      log.warn(
        "DMN carries no merchant_id or merchant_site_id; merchant match skipped.",
        this.getDmnLogFields(body),
      );
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
      (tx) =>
        (tx.type === PaymentTransactions.AUTHORIZATION || tx.type === PaymentTransactions.CHARGE) &&
        (tx.state === "Success" || tx.state === "Failure"),
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
    assertNuveiStatusMatchesPayment(
      statusBody,
      payment,
      String(dmnClientUniqueId),
      true,
    );
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

  private getDmnPlannedAmount(
    body: Record<string, unknown>,
  ): { centAmount: number; currencyCode: string } | undefined {
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
      const statusBody = await withAbortTimeout(
        (signal) => nuveiClient().getPaymentStatus({ sessionToken, signal }),
        DMN_SESSION_VERIFICATION_TIMEOUT_MS,
        "Nuvei session verification timed out",
      );

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

  /**
   * Verifies session-bound candidates through Nuvei, trying first the ones that
   * already hold the DMN's transaction identity (e.g. a settle/refund DMN for a
   * Payment that already recorded its Auth). Abandoned sibling sessions never
   * hold that identity, so they no longer count toward the candidate cap when
   * the real Payment can be told apart locally.
   *
   * Identity alone never decides: every narrowed candidate is still verified, and
   * if none verifies the remaining candidates are verified as before.
   */
  private async verifySessionBoundCandidatesPreferringIdentity(
    candidates: Payment[],
    cartId: string,
    body: Record<string, unknown>,
  ): Promise<Payment[]> {
    const holdingDmnTransaction = this.getPaymentsMatchingDmnTransactionIdentity(candidates, body);
    if (holdingDmnTransaction.length === 0 || holdingDmnTransaction.length === candidates.length) {
      return this.getNuveiVerifiedSessionBoundPayments(candidates, cartId);
    }

    const verified = await this.getNuveiVerifiedSessionBoundPayments(holdingDmnTransaction, cartId);
    if (verified.length > 0) {
      return verified;
    }

    const remaining = candidates.filter((payment) => !holdingDmnTransaction.includes(payment));
    return this.getNuveiVerifiedSessionBoundPayments(remaining, cartId);
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
}
