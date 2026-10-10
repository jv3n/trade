/**
 * Trading pattern shared by candidates, stats and trades — matches the backend `Pattern` enum
 * (`com.portfolioai.shared.Pattern`) and the Postgres enum `pattern`, and crosses the wire as-is.
 *
 * Lives under `core/api/shared/` because it belongs to no single bucket. Labels are translated via
 * `patterns.short.<value>` (compact : table cells, chips) and `patterns.long.<value>` (select
 * options) in the i18n files.
 */
export type Pattern = 'GUS' | 'DT' | 'SIR' | 'SIV' | 'DISCRETIONARY';

/** Every pattern, in display order — what a trade can carry. */
export const PATTERNS: readonly Pattern[] = ['GUS', 'DT', 'SIR', 'SIV', 'DISCRETIONARY'];

/**
 * The patterns a stat measures (#648) — the only two traded and measured. SIR, SIV and
 * discretionary stay trades only, typed in the journal with no stat.
 */
export type StatPattern = 'GUS' | 'DT';
export const STAT_PATTERNS: readonly StatPattern[] = ['GUS', 'DT'];

/** Pattern pre-selected when something is created without one. */
export const DEFAULT_PATTERN: Pattern = 'GUS';
