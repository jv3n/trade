import { PositionStatus, TradeDirection, TradeExecutionInput } from './trade-entry.model';

/**
 * Frontend mirror of the backend `TradePositionCalculator` — derives a position's aggregates from
 * its raw executions for a **live preview** in the trade dialog and a read-only summary on the
 * detail page. The backend stays the source of truth (it recomputes on persist) ; this is purely
 * for instant UX feedback before the round-trip.
 *
 * Number-based (the backend uses `BigDecimal`), so values may differ by a sub-cent rounding — fine
 * for a preview. Lenient by design : an inconsistent set (exit without entry, more exited than
 * entered, missing direction) yields `valid: false` rather than throwing, so the form can flag it.
 *
 * Sign convention matches the backend : profit = sign × (avgExit − avgEntry) × exitedShares, with
 * sign = +1 for BUY, −1 for SHORT (sold high, covered low → gain).
 */
export interface PositionAggregates {
  size: number | null;
  avgEntry: number | null;
  avgExit: number | null;
  profitDollars: number | null;
  gainPercent: number | null;
  status: PositionStatus;
  /** False when the executions are inconsistent (see lenience note above). */
  valid: boolean;
}

const EMPTY: PositionAggregates = {
  size: null,
  avgEntry: null,
  avgExit: null,
  profitDollars: null,
  gainPercent: null,
  status: 'OPEN',
  valid: true,
};

function weightedAverage(legs: TradeExecutionInput[]): number {
  const totalShares = legs.reduce((acc, l) => acc + l.shares, 0);
  const notional = legs.reduce((acc, l) => acc + l.price * l.shares, 0);
  return notional / totalShares;
}

export function computePositionAggregates(
  direction: TradeDirection | null,
  executions: TradeExecutionInput[],
): PositionAggregates {
  const legs = executions.filter((e) => e.shares > 0 && e.price > 0);
  if (legs.length === 0) return EMPTY;

  const entries = legs.filter((l) => l.kind === 'ENTRY');
  const exits = legs.filter((l) => l.kind === 'EXIT');
  if (entries.length === 0 || direction === null) {
    return { ...EMPTY, valid: false };
  }

  const entryShares = entries.reduce((acc, l) => acc + l.shares, 0);
  const exitShares = exits.reduce((acc, l) => acc + l.shares, 0);
  if (exitShares > entryShares) {
    return { ...EMPTY, size: entryShares, avgEntry: weightedAverage(entries), valid: false };
  }

  const avgEntry = weightedAverage(entries);
  if (exitShares === 0) {
    return {
      size: entryShares,
      avgEntry,
      avgExit: null,
      profitDollars: null,
      gainPercent: null,
      status: 'OPEN',
      valid: true,
    };
  }

  const avgExit = weightedAverage(exits);
  const sign = direction === 'BUY' ? 1 : -1;
  const profitDollars = sign * (avgExit - avgEntry) * exitShares;
  const gainPercent = (profitDollars / (avgEntry * exitShares)) * 100;

  return {
    size: entryShares,
    avgEntry,
    avgExit,
    profitDollars,
    gainPercent,
    status: exitShares === entryShares ? 'CLOSED' : 'PARTIAL',
    valid: true,
  };
}
