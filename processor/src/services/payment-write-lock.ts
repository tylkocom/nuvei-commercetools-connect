/**
 * Serializes work per commercetools Payment id inside this process.
 *
 * Terminal transactions (Authorization/Charge Success|Failure) can be reported
 * by two independent channels at almost the same time: the shopper's browser
 * confirm and Nuvei's DMN. Each channel checks "was a terminal outcome already
 * recorded?" and then calls Nuvei before writing, so both checks can pass before
 * either write lands. The channels also identify the same payment with different
 * ids (fiscal transactionId vs PPP id), so an interactionId comparison cannot
 * catch it afterwards.
 *
 * Holding this lock across "re-read the Payment, re-check the outcome, write"
 * makes the second writer observe the first writer's transaction.
 *
 * Scope: this only orders writers inside one processor instance. It does not
 * coordinate between instances.
 */
const queues = new Map<string, Promise<void>>();

export async function withPaymentWriteLock<T>(
  paymentId: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(paymentId) ?? Promise.resolve();

  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  // `previous` only ever resolves (each turn is released in `finally`), so the
  // chain cannot reject and poison later writers.
  const tail = previous.then(() => turn);
  queues.set(paymentId, tail);

  await previous;
  try {
    return await work();
  } finally {
    release();
    if (queues.get(paymentId) === tail) {
      queues.delete(paymentId);
    }
  }
}
