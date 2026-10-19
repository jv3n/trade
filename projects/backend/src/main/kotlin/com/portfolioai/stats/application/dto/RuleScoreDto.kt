package com.portfolioai.stats.application.dto

import com.portfolioai.stats.domain.MechanicalRule
import java.math.BigDecimal
import java.time.LocalDate

/**
 * The mechanical GUS rules replayed over a rolling window (#205) : [dateFrom] → [dateTo], both
 * inclusive, on the [completed] GUS of that window. One row per [MechanicalRule].
 *
 * Every figure is sent whatever the sample : the interface decides below which `triggered` a rate
 * says nothing.
 */
data class RuleScoreDto(
  val dateFrom: LocalDate,
  val dateTo: LocalDate,
  val completed: Int,
  val rules: List<RuleScoreRowDto>,
)

/**
 * One rule over the window. Percentages are whole numbers of the entry (`16.80` = +16.80 %), the
 * short's result : positive is a gain.
 *
 * @param triggered GUS whose HOD reached the entry — the rule's trades.
 * @param stopped Triggered trades whose HOD reached the stop.
 * @param wins Triggered trades covered at the EOD under the entry.
 * @param averageWinPercent Average of the wins ; null without one.
 * @param averageLossPercent Average of the other trades (stopped, or covered at or above the
 *   entry), negative or zero ; null without one.
 * @param winLossRatio Average win ÷ the average loss's size ; null without both, or when the losses
 *   averaged zero.
 * @param expectancyPercent Average result per triggered trade ; null without one.
 */
data class RuleScoreRowDto(
  val rule: MechanicalRule,
  val entryPercent: Int,
  val stopPercent: Int,
  val triggered: Int,
  val stopped: Int,
  val wins: Int,
  val averageWinPercent: BigDecimal?,
  val averageLossPercent: BigDecimal?,
  val winLossRatio: BigDecimal?,
  val expectancyPercent: BigDecimal?,
)
