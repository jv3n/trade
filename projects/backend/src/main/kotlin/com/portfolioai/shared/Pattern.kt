package com.portfolioai.shared

/**
 * Trading pattern a stat and a trade are tagged with — a candidate gets one per stat, when promoted
 * (#434). Shared by the three bounded contexts (candidates → stats → journal), hence `shared/`
 * rather than one module's `domain/`.
 *
 * Names must match the Postgres enum `pattern` (`V1__baseline.sql`, extended by `V9`) :
 * `@JdbcTypeCode(SqlTypes.NAMED_ENUM)` maps by name. The list is expected to grow — a new value is
 * a deploy plus a migration adding it to the Postgres enum.
 */
enum class Pattern {
  /** Gap Up Short — short a small-cap that gapped up in premarket with no fundamental. Default. */
  GUS,

  /** Double Top — short on a double top. */
  DT,

  /** Short Into Resistance — short into a resistance (previous high, PM high, round number). */
  SIR,

  /** Short Into VWAP — short a bounce back up into the VWAP from below. */
  SIV,

  /** Discretionary — a trade without a pre-set pattern. */
  DISCRETIONARY,
}
