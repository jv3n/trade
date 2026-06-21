import { describe, expect, it } from 'vitest';
import {
  borrowFeePercent,
  coverSummary,
  dollarAtRisk,
  entryLadder,
  entrySummary,
  executionSummary,
  gusPercent,
} from './candidates.math';

/**
 * Pure-function spec for the candidates' math — the heart of the feature (the components are a thin
 * signal layer on top). Pins the formulas and the **null-on-bad-input** contract (no NaN / Infinity
 * ever leaks to the UI), in isolation from Angular. Fixtures reuse the trader's real "Trading Desk"
 * spreadsheet numbers (ticker `casst`, open $12.04, $365 risk budget) so the spec doubles as a
 * regression check against the sheet the feature replaces.
 */
describe('dollarAtRisk', () => {
  it('takes the percentage of total capital as the risk budget', () => {
    expect(dollarAtRisk(7300, 5)).toBe(365); // 7300 × 5 %
  });

  it('returns null when capital or percentage is missing', () => {
    expect(dollarAtRisk(null, 5)).toBeNull();
    expect(dollarAtRisk(7300, null)).toBeNull();
  });
});

describe('entryLadder', () => {
  const open = 12.04;
  const stop = 0.4;
  const budget = 365;
  const rung = (step: number) => entryLadder(open, stop, budget).find((r) => r.step === step)!;

  it('prices each rung as open × (1 + step)', () => {
    expect(rung(0.35).price).toBeCloseTo(16.254, 3); // +35 %
    expect(rung(0).price).toBeCloseTo(12.04, 3); // the open itself
    expect(rung(-0.1).price).toBeCloseTo(10.836, 3); // −10 %, profit zone
  });

  it('sizes max shares so a stop-out costs exactly the risk budget, rounded like the sheet', () => {
    // riskPerShare@35% = (0.40 − 0.35) × 12.04 = 0.602 → 365 / 0.602 = 606.3 → 606
    expect(rung(0.35).maxShares).toBe(606);
    expect(rung(0.3).maxShares).toBe(303);
    expect(rung(0.2).maxShares).toBe(152); // 151.6 rounds up — the sheet rounds, it does not floor
    expect(rung(0.05).maxShares).toBe(87); // 86.6 rounds up
  });

  it('carries no sizing on the open row, the profit zone, or the stop row', () => {
    // The open (0%) is the reference, not a scale-in rung — no shares there.
    expect(rung(0).riskPerShare).toBeNull();
    expect(rung(0).maxShares).toBeNull();
    // Negative rungs are cover targets, not entries.
    expect(rung(-0.2).maxShares).toBeNull();
    // The stop rung has zero room to the stop → no position.
    expect(rung(0.4).maxShares).toBeNull();
  });

  it('still prices the profit-zone rungs (only the sizing columns go null)', () => {
    expect(rung(-0.4).price).toBeCloseTo(7.224, 3);
    expect(rung(-0.4).totalInvestment).toBeNull();
  });

  it('returns an empty ladder when the open price is missing or non-positive', () => {
    expect(entryLadder(null, stop, budget)).toEqual([]);
    expect(entryLadder(0, stop, budget)).toEqual([]);
  });

  it('prices every rung but leaves sizing null when stop or budget is missing', () => {
    const noStop = entryLadder(open, null, budget);
    expect(noStop.find((r) => r.step === 0.35)!.price).toBeCloseTo(16.254, 3);
    expect(noStop.find((r) => r.step === 0.35)!.maxShares).toBeNull();
  });
});

describe('executionSummary', () => {
  const open = 12.04;
  const ladder = entryLadder(open, 0.4, 365);

  it('rolls up filled shares into current risk, residual budget and the average position', () => {
    // The trader is short 200 @ +10% and 400 @ +20% (the spreadsheet's live tracker).
    const fills = new Map<number, number>([
      [0.1, 200],
      [0.2, 400],
    ]);
    const summary = executionSummary(ladder, fills, 365);

    expect(summary.totalShares).toBe(600);
    // currentRisk = 200 × (0.30 × 12.04) + 400 × (0.20 × 12.04) = 722.4 + 963.2
    expect(summary.totalCurrentRisk).toBeCloseTo(1685.6, 1);
    // residual = 365 − 1685.6 → negative: the position is over the risk budget.
    expect(summary.residual).toBeCloseTo(-1320.6, 1);
    // weighted average short entry = 8428 / 600
    expect(summary.averagePosition).toBeCloseTo(14.05, 2);
  });

  it('reports a null average position and no residual when nothing is filled', () => {
    const summary = executionSummary(ladder, new Map(), null);
    expect(summary.totalShares).toBe(0);
    expect(summary.averagePosition).toBeNull();
    expect(summary.residual).toBeNull();
  });
});

describe('entrySummary', () => {
  // Screenshot reference : open 5.00, stop +40 % → stop price 7.00. One leg 200 @ 3.21.
  it('derives the entry %, dollar risk, risk % and notional for each free-form leg', () => {
    const row = entrySummary([{ entryPrice: 3.21, sharesInPlay: 200 }], 5, 0.4).rows[0];
    expect(row.entryPct).toBeCloseTo(-35.8, 1); // (3.21 − 5) / 5
    expect(row.riskPerShare).toBeCloseTo(3.79, 2); // stop 7.00 − 3.21
    expect(row.currentRisk).toBeCloseTo(758, 0); // 200 × 3.79
    expect(row.riskPct).toBeCloseTo(118.07, 2); // 3.79 / 3.21
    expect(row.investment).toBeCloseTo(642, 0); // 200 × 3.21
  });

  it('rolls up the weighted average short position, average % and average risk %', () => {
    const s = entrySummary(
      [
        { entryPrice: 3.21, sharesInPlay: 200 },
        { entryPrice: 4.0, sharesInPlay: 100 },
      ],
      5,
      0.4,
    );
    expect(s.totalShares).toBe(300);
    expect(s.totalInvestment).toBeCloseTo(1042, 0); // 642 + 400
    expect(s.averagePosition).toBeCloseTo(3.473, 2); // 1042 / 300
    expect(s.averagePct).toBeCloseTo(-30.53, 2); // (3.473 − 5) / 5
    expect(s.averageRiskPct).toBeCloseTo(101.5, 1); // (7 − 3.473) / 3.473
  });

  it('leaves the risk columns null when the open or stop is missing (no NaN leaks)', () => {
    const noStop = entrySummary([{ entryPrice: 3.21, sharesInPlay: 200 }], 5, null);
    expect(noStop.rows[0].entryPct).toBeCloseTo(-35.8, 1); // still computable from the open alone
    expect(noStop.rows[0].riskPerShare).toBeNull();
    expect(noStop.rows[0].currentRisk).toBeNull();
    expect(noStop.rows[0].riskPct).toBeNull();
    const noOpen = entrySummary([{ entryPrice: 3.21, sharesInPlay: 200 }], null, 0.4);
    expect(noOpen.rows[0].entryPct).toBeNull();
    expect(noOpen.rows[0].riskPerShare).toBeNull();
  });

  it('reports a null average position when nothing is filled', () => {
    const s = entrySummary([], 5, 0.4);
    expect(s.totalShares).toBe(0);
    expect(s.averagePosition).toBeNull();
    expect(s.averagePct).toBeNull();
    expect(s.averageRiskPct).toBeNull();
  });
});

describe('coverSummary', () => {
  it('scores each cover leg against the average position (gain when covered below entry)', () => {
    const summary = coverSummary([{ exitPrice: 3.0, sharesCovered: 200 }], 3.78);
    expect(summary.rows[0].pctGainLoss).toBeCloseTo(20.63, 2); // (3.78 − 3.00) / 3.78
    expect(summary.rows[0].dollarGainLoss).toBeCloseTo(156, 0); // (3.78 − 3.00) × 200
  });

  it('computes the weighted average take-profit across legs', () => {
    const summary = coverSummary(
      [
        { exitPrice: 3.0, sharesCovered: 200 },
        { exitPrice: 2.89, sharesCovered: 100 },
        { exitPrice: 2.81, sharesCovered: 100 },
        { exitPrice: 4.0, sharesCovered: 100 },
      ],
      3.776,
    );
    expect(summary.totalShares).toBe(500);
    expect(summary.averageTp).toBeCloseTo(3.14, 2); // (600 + 289 + 281 + 400) / 500
    expect(summary.averagePct).toBeCloseTo(16.84, 2); // (3.776 − 3.14) / 3.776
  });

  it('returns null gain/loss when there is no average position yet', () => {
    const summary = coverSummary([{ exitPrice: 3.0, sharesCovered: 200 }], null);
    expect(summary.rows[0].pctGainLoss).toBeNull();
    expect(summary.rows[0].dollarGainLoss).toBeNull();
    expect(summary.totalDollarGainLoss).toBe(0);
  });
});

describe('borrowFeePercent', () => {
  it('expresses the per-share borrow cost as a percentage of the entry', () => {
    expect(borrowFeePercent(12, 0.1)).toBeCloseTo(0.83, 2); // 0.10 / 12 × 100
  });

  it('returns 0 when there is no borrow cost', () => {
    expect(borrowFeePercent(5, 0)).toBe(0);
  });

  it('returns null on missing input or a zero entry price (no NaN leaks)', () => {
    expect(borrowFeePercent(null, 0.25)).toBeNull();
    expect(borrowFeePercent(5, null)).toBeNull();
    expect(borrowFeePercent(0, 0.25)).toBeNull(); // division by zero guarded
  });
});

describe('gusPercent', () => {
  it('computes the gap amount and percentage on a gap up', () => {
    const r = gusPercent(3.9, 12.04)!; // the `casst` morning gap
    expect(r.amount).toBeCloseTo(8.14, 2);
    expect(r.percent).toBeCloseTo(208.72, 2); // (12.04 − 3.9) / 3.9
  });

  it('reports a negative percentage on a gap down', () => {
    const r = gusPercent(4, 3)!;
    expect(r.amount).toBe(-1);
    expect(r.percent).toBe(-25);
  });

  it('returns null on missing input or a zero previous close', () => {
    expect(gusPercent(null, 3)).toBeNull();
    expect(gusPercent(2, null)).toBeNull();
    expect(gusPercent(0, 3)).toBeNull(); // division by zero guarded
  });
});
