package com.portfolioai.stats.domain

import java.math.BigDecimal
import java.util.UUID

/**
 * Port — the premarket of a stat's source candidate (#649). A double top keeps none, so a sibling
 * born from one under a session pattern reads it here. The candidates context implements it ; a
 * port rather than a call to its service, which already depends on the stats.
 */
fun interface CandidatePremarket {
  /** Null when the candidate is gone or not the user's. */
  fun of(candidateId: UUID, userId: UUID): Premarket?
}

data class Premarket(val previousClose: BigDecimal, val pmOpen: BigDecimal, val pmHigh: BigDecimal)
