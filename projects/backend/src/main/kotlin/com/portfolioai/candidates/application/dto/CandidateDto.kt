package com.portfolioai.candidates.application.dto

import com.portfolioai.shared.Pattern
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One candidate as exposed to the front — the raw morning capture, plus the stats it became, one
 * per pattern (#434). Gap %, push %, locate / price and the target price are derived client-side
 * from these fields and never stored. Float and volume are in millions of shares, the locate in $ /
 * share.
 *
 * [pattern], [promoted] and [statId] keep the current front working until it reads [stats] (#436),
 * which removes them.
 */
data class CandidateDto(
  val id: UUID,
  val tradingDate: LocalDate,
  val ticker: String,
  val previousClose: BigDecimal,
  val pmOpen: BigDecimal,
  val pmHigh: BigDecimal,
  val floatMillions: BigDecimal?,
  val volumeMillions: BigDecimal?,
  val locatePerShare: BigDecimal?,
  val note: String?,
  /** Session open typed at 9:30 — null until then. */
  val openPrice: BigDecimal?,
  /** Push aimed at, in % above the open — null = follows the reference picked on the card. */
  val targetPushPercent: BigDecimal?,
  /** The stats it became, in the order of [Pattern] — empty until promoted. */
  val stats: List<CandidateStatDto>,
  val createdAt: Instant,
  val updatedAt: Instant,
) {
  /** Always GUS : the pattern the current front captures and reads its references for. */
  val pattern: Pattern
    get() = Pattern.GUS

  /** True once it has any stat. */
  val promoted: Boolean
    get() = stats.isNotEmpty()

  /** Its GUS stat, or its first one — what the single « in stats » badge links to. */
  val statId: UUID?
    get() = (stats.find { it.pattern == Pattern.GUS } ?: stats.firstOrNull())?.statId
}
