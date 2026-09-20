package com.portfolioai.candidates.application.dto

import com.portfolioai.shared.Pattern
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One candidate as exposed to the front — the raw morning capture, plus whether it already made it
 * to the stats sheet. Gap %, push % and locate / price are derived client-side from these fields
 * and never stored. Float and volume are in millions of shares, the locate in $ / share.
 */
data class CandidateDto(
  val id: UUID,
  val tradingDate: LocalDate,
  val pattern: Pattern,
  val ticker: String,
  val previousClose: BigDecimal,
  val pmOpen: BigDecimal,
  val pmHigh: BigDecimal,
  val floatMillions: BigDecimal?,
  val volumeMillions: BigDecimal?,
  val locatePerShare: BigDecimal?,
  val note: String?,
  /** True once this candidate has been promoted to the stats sheet (#189) — it cannot be twice. */
  val promoted: Boolean,
  val createdAt: Instant,
  val updatedAt: Instant,
)
