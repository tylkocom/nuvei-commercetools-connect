# Order Payment State Update Plan

## Context

The Nuvei connector currently records payment truth on commercetools `Payment` resources. It creates a `Payment`, attaches it to the Cart, and records terminal Nuvei outcomes as `Payment` transactions.

This does not update the related Order's `paymentState`. As a result, downstream consumers cannot rely on `OrderPaymentStateChanged` Commerce Notifications to know when an Order is paid and ready for invoicing or fulfillment.

## Current Behavior

- `POST /payments/session` creates a CT `Payment` with an initial `Authorization` transaction.
- Frontend confirmation writes a terminal `Authorization` transaction with `Success` or `Failure`.
- Nuvei DMNs write mapped CT `Payment` transactions such as `Authorization`, `Charge`, `Refund`, and `CancelAuthorization`.
- The connector derives `paymentStatus.interfaceCode` values such as `authorized`, `paid`, `refunded`, and `cancelled`, but it does not update an Order.
- `ctOrderService` is injected into `NuveiPaymentService`, but the connector does not currently use it for Order state changes.

## Gap

The connector should propagate terminal payment outcomes to the related Order when an Order exists and the outcome has clear Order-level meaning.

Without this, internal workflows must subscribe to Payment transaction Commerce Notifications instead of the cleaner Order-level `OrderPaymentStateChanged` notification.

## Proposed Behavior

Update the related Order's `paymentState` with the commercetools `changePaymentState` update action when a terminal payment outcome is confirmed.

Suggested mapping:

| Payment transaction | Condition | Order `paymentState` |
| --- | --- | --- |
| `Authorization` `Success` | Authorization-only checkout where authorization is sufficient for operations | `Pending` or unchanged |
| `Charge` `Success` | Full planned amount captured or settled | `Paid` |
| `Authorization` `Failure` | No later successful payment exists for the Order | `Failed` |
| `Refund` `Success` | Full amount refunded | `Refunded` |
| `Refund` `Success` | Partial amount refunded | `CreditOwed` or unchanged |

The key business decision is whether `Authorization Success` is enough to start invoicing and fulfillment. If not, only `Charge Success` should move the Order to `Paid`.

## Implementation Notes

- Payment confirmation may happen before Checkout creates the Order from the Cart. Do not assume an Order exists during `confirmPayment`.
- DMNs can arrive before or after Order creation. The update path must tolerate both timings.
- Resolve the Order by the original Cart ID or by searching Orders that reference the Payment.
- Make the update idempotent: if the Order already has the target `paymentState`, do nothing.
- Avoid downgrading an Order from `Paid` because of a later failed retry or duplicate notification.
- On concurrent version conflicts, refetch the Order and retry the `changePaymentState` action if still needed.
- If no Order exists yet, log the unresolved state and rely on a later DMN or reconciliation path to apply the Order update.

## Acceptance Criteria

- A successful full `Charge` transaction updates the related Order to `paymentState: "Paid"` once the Order exists.
- Duplicate confirmations or duplicate DMNs do not produce repeated Order updates.
- Failed payment attempts do not overwrite an already-paid Order.
- Existing Payment transaction recording remains unchanged.
- Tests cover Order-not-yet-created, Order already paid, successful charge, failed authorization, and duplicate DMN cases.

## Downstream Impact

After this is implemented, downstream services can subscribe to `OrderPaymentStateChanged` Commerce Notifications and treat `paymentState: "Paid"` as the primary signal for paid Orders.
