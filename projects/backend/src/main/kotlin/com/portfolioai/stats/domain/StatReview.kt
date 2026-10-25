package com.portfolioai.stats.domain

import com.portfolioai.shared.Pattern

/**
 * Where a stat comes from (#762) — names match the Postgres enum `stat_source` (V30). A scanner
 * stat carries a [StatReview] ; a manual one has none.
 */
enum class StatSource {
  /** Promoted from a candidate or typed by hand. */
  MANUAL,
  /** Dropped by ts-scanner from the previous session's bars (#760). */
  SCANNER,
}

/**
 * The review of a scanner stat (#762) — Postgres enum `stat_review`. Only a [VALIDATED] one counts
 * in the figures, and only it can be ticked.
 */
enum class StatReview {
  /** As the scanner dropped it — out of every figure until reviewed. */
  TO_REVIEW,
  /** « This is the pattern » — now an ordinary stat, to complete then tick. */
  VALIDATED,
  /** Not the pattern — kept so a re-scan never brings it back, hidden but from « Rejetées ». */
  REJECTED,
}

/**
 * Why a scanner stat was rejected (#762), per pattern — Postgres enum `stat_rejection_reason`. A
 * reason of another pattern is refused.
 */
enum class StatRejectionReason(val patterns: Set<Pattern>) {
  /** The Echo took the Apex and kept going. */
  BREAKOUT(setOf(Pattern.DT)),
  WEAK_REJECTION(setOf(Pattern.DT)),
  ECHO_TOO_FAR(setOf(Pattern.DT)),
  GAP_TOO_SMALL(setOf(Pattern.GUS)),
  /** A fundamental behind the gap. */
  NEWS(setOf(Pattern.GUS)),
  FLOAT_OUT_OF_RANGE(setOf(Pattern.GUS)),
  NOISE(setOf(Pattern.GUS, Pattern.DT)),
  OTHER(setOf(Pattern.GUS, Pattern.DT)),
}
