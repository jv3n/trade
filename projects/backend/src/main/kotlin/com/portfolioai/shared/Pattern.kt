package com.portfolioai.shared

/**
 * Trading pattern a candidate, a stat and a trade are tagged with. Shared by the three bounded
 * contexts (candidates → stats → journal), hence `shared/` rather than one module's `domain/`.
 *
 * Names must match the Postgres enum `pattern` (see `V12__shared_pattern_enum.sql`) :
 * `@JdbcTypeCode(SqlTypes.NAMED_ENUM)` maps by name. The list is expected to grow — a new value is
 * a deploy plus a migration adding it to the Postgres enum.
 */
enum class Pattern {
  /** Gap Up Short — short a small-cap that gapped up in premarket with no fundamental. Default. */
  GUS,

  /** Double Top — short on a double top. */
  DT,

  /** Discretionary — a trade without a pre-set pattern. */
  DISCRETIONARY,
}
