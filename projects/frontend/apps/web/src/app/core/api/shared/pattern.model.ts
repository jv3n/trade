/**
 * Trading pattern shared by candidates, stats and trades — matches the backend `Pattern` enum
 * (`com.portfolioai.shared.Pattern`) and the Postgres enum `pattern`, and crosses the wire as-is.
 *
 * Lives under `core/api/shared/` because it belongs to no single bucket. Labels are translated via
 * `patterns.short.<value>` (compact : table cells, chips) and `patterns.long.<value>` (select
 * options) in the i18n files.
 */
export type Pattern = 'GUS' | 'DT' | 'SIR' | 'SIV' | 'DISCRETIONARY';

/** Every pattern, in display order. */
export const PATTERNS: readonly Pattern[] = ['GUS', 'DT', 'SIR', 'SIV', 'DISCRETIONARY'];

/** Pattern pre-selected when something is created without one. */
export const DEFAULT_PATTERN: Pattern = 'GUS';
