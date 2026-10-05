/**
 * Locate cost = shares × price per share, rounded half-up to the cent like the backend's — `null`
 * until shares above zero and a price are typed. A price of 0 is a locate charged nothing.
 *
 * In integers : the float product lands just under an exact half-cent and would round it down
 * (150 × 0.0069 → 1.03, saved 1.04). The price has at most four decimals.
 */
export function locateCost(shares: number | null, pricePerShare: number | null): number | null {
  if (shares === null || !(shares > 0) || pricePerShare === null || pricePerShare < 0) return null;
  const tenThousandths = Math.round(pricePerShare * 10_000);
  return Math.round((shares * tenThousandths) / 100) / 100;
}

/**
 * The rule the weight is checked against : a locate costs less than 2 % of the share's price. At or
 * above it the figure reads amber — a warning on the discipline.
 */
export const MAX_LOCATE_PERCENT = 2;

/** Whether a weight breaks [MAX_LOCATE_PERCENT] — `false` when unknown. */
export function locateBreach(percent: number | null): boolean {
  return percent !== null && percent >= MAX_LOCATE_PERCENT;
}

/**
 * The locate's weight against the share : price per share ÷ share price, in % (0.05 on a $2.50 share
 * = 2 %) — `null` without a positive share price.
 */
export function locatePercent(
  pricePerShare: number | null,
  stockPrice: number | null,
): number | null {
  if (pricePerShare === null || stockPrice === null || !(stockPrice > 0)) return null;
  return (pricePerShare / stockPrice) * 100;
}

/**
 * The day's weight of several locates on one ticker : cost ÷ (shares × share price), over the ones
 * typed with a share price — what answers « was this ticker under 2 % today » across top-ups at
 * different prices. `null` when none has a share price.
 */
export function blendedLocatePercent(
  locates: readonly { shares: number; pricePerShare: number; stockPrice: number | null }[],
): number | null {
  const weighed = locates.filter((l) => l.stockPrice !== null && l.stockPrice > 0);
  if (weighed.length === 0) return null;
  const paid = weighed.reduce((sum, l) => sum + l.shares * l.pricePerShare, 0);
  const value = weighed.reduce((sum, l) => sum + l.shares * (l.stockPrice as number), 0);
  return (paid / value) * 100;
}

/** Sums amounts already to the cent, without the float drift of a running sum (0.1 + 0.2). */
export function sumCents(amounts: readonly number[]): number {
  return amounts.reduce((sum, a) => sum + Math.round(a * 100), 0) / 100;
}
