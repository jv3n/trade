export const TARGET = 15;
const QUICK_WIN_MAX_GAP = 0.25;

/** CRAP(fn) = CC² × (1 − coverage)³ + CC ; null when the coverage is unknown, never estimated. */
export function crap(complexity, coverage) {
  if (coverage === null) return null;
  return complexity ** 2 * (1 - coverage) ** 3 + complexity;
}

export function band(score) {
  if (score === null) return 'unknown';
  if (score < 5) return 'low';
  if (score < 15) return 'moderate';
  if (score <= 30) return 'high';
  return 'critical';
}

/** The coverage bringing a function under [target] ; null when no test can : CC is the floor. */
export function coverageNeeded(complexity, target = TARGET) {
  if (complexity >= target) return null;
  return Math.max(0, 1 - Math.cbrt((target - complexity) / complexity ** 2));
}

/** Coverage of the lines from [start] to [end], null when no line of the range is instrumented. */
export function rangeCoverage(hits, start, end) {
  if (!hits) return null;
  let total = 0;
  let covered = 0;
  for (const [line, count] of hits) {
    if (line < start || line > end) continue;
    total += 1;
    if (count > 0) covered += 1;
  }
  return total === 0 ? null : covered / total;
}

export function scored(entries) {
  return entries
    .map((entry) => {
      const score = crap(entry.complexity, entry.coverage);
      return { ...entry, crap: score, band: band(score) };
    })
    .sort((a, b) => (b.crap ?? -1) - (a.crap ?? -1) || b.complexity - a.complexity);
}

function isQuickWin(entry) {
  if (entry.crap === null || entry.crap < TARGET) return false;
  const needed = coverageNeeded(entry.complexity);
  return needed !== null && needed - entry.coverage <= QUICK_WIN_MAX_GAP;
}

export function quickWins(rows) {
  return rows
    .filter(isQuickWin)
    .sort((a, b) => coverageNeeded(a.complexity) - a.coverage - (coverageNeeded(b.complexity) - b.coverage));
}

export function refactorFirst(rows) {
  return rows.filter((row) => row.complexity >= TARGET);
}

const key = (row) => `${row.file}#${row.name}`;

/** What moved since [previous] ; a function is matched by file and name, so a rename reads new. */
export function compare(previous, rows) {
  const before = new Map(previous.map((row) => [key(row), row]));
  const moved = { new: 0, worse: 0, better: 0 };
  for (const row of rows) {
    const old = before.get(key(row));
    if (!old) moved.new += 1;
    else if ((row.crap ?? 0) > (old.crap ?? 0)) moved.worse += 1;
    else if ((row.crap ?? 0) < (old.crap ?? 0)) moved.better += 1;
  }
  return moved;
}
