package com.portfolioai.candidates.application.dto

import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One candidate as exposed to the front — the raw saved inputs only. The cockpit's derived figures
 * (entry ladder, execution totals, residual risk, cover gains, GUS / borrow %) are computed
 * client-side from these and never stored. Percentages are whole numbers (`5.00` = 5 %, `40.00` =
 * 40 %).
 */
data class CandidateDto(
  val id: UUID,
  val tradingDate: LocalDate,
  val ticker: String,
  val totalCapital: BigDecimal,
  val pctCapitalAtRisk: BigDecimal,
  val openPrice: BigDecimal,
  val stopPct: BigDecimal?,
  val previousClose: BigDecimal?,
  val floatShares: BigDecimal?,
  val volume: BigDecimal?,
  val morningPush: BigDecimal?,
  val borrowCostPerShare: BigDecimal?,
  val fills: List<CandidateFill>,
  val entries: List<CandidateEntry>,
  val exits: List<CandidateExit>,
  val note: String?,
  val createdAt: Instant,
  val updatedAt: Instant,
)
