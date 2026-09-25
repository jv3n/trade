/** Decimals a price is copied with — the precision it is shown with (#311). */
export function priceDigits(price: number | null): number {
  return price !== null && Math.abs(price) < 1 ? 4 : 2;
}
