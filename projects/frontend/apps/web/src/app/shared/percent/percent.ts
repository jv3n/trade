/**
 * Percentage change shared by the candidates and the stats features — gap, premarket push, and
 * every session level measured against the session open.
 *
 * Whole-number percentage (`52.83` = +52.83 %), and **null rather than `NaN` / `Infinity`** when a
 * value is missing or the base is not positive, so a page can show a neutral "—" instead of a
 * broken number.
 */
export function percentChange(base: number | null, value: number | null): number | null {
  if (base === null || value === null || !(base > 0)) return null;
  return ((value - base) / base) * 100;
}
