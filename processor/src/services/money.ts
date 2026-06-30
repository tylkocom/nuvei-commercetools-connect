const currencyFractionDigitsCache = new Map<string, number>();

export function getCurrencyFractionDigits(currencyCode: string): number {
  const cached = currencyFractionDigitsCache.get(currencyCode);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const fractionDigits =
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    currencyFractionDigitsCache.set(currencyCode, fractionDigits);
    return fractionDigits;
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error(`Unsupported currency: ${currencyCode}`);
    }
    throw error;
  }
}

export function scaleToCentAmount(amount: number, currencyCode: string): number {
  return Math.round(amount * 10 ** getCurrencyFractionDigits(currencyCode));
}
