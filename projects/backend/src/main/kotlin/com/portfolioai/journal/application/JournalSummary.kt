package com.portfolioai.journal.application

import com.portfolioai.journal.application.dto.JournalSummaryDto
import com.portfolioai.journal.domain.OutOfPatternStats
import com.portfolioai.journal.domain.TradeEntry
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * The KPIs of [TradeEntryService.summarise] over the filtered [rows] ; [outOfPatternStats] tells
 * which of their stats are out of pattern (#499).
 */
internal fun journalSummaryOf(
  rows: List<TradeEntry>,
  outOfPatternStats: OutOfPatternStats,
): JournalSummaryDto {
  val realized = rows.mapNotNull { it.retainedProfit }
  val wins = realized.filter { it.signum() > 0 }
  val losses = realized.filter { it.signum() < 0 }
  val winSum = wins.fold(BigDecimal.ZERO, BigDecimal::add)
  val lossSum = losses.fold(BigDecimal.ZERO, BigDecimal::add)
  val closed = rows.mapNotNull { trade -> trade.retainedProfit?.let { trade.statEntryId to it } }
  val outIds = outOfPatternStats.among(closed.map { (statId, _) -> statId }.toSet())
  val (outOfPattern, inRules) = closed.partition { (statId, _) -> statId in outIds }
  return JournalSummaryDto(
    tradeCount = realized.size,
    retainedPnl = realized.fold(BigDecimal.ZERO, BigDecimal::add),
    winCount = wins.size,
    lossCount = losses.size,
    winRatePercent = percentage(wins.size, realized.size),
    averageWin = average(winSum, wins.size),
    averageLoss = average(lossSum, losses.size),
    // No loser yet : the ratio is undefined, not infinite — the front shows a dash.
    profitFactor =
      if (losses.isEmpty()) null else winSum.divide(lossSum.abs(), 2, RoundingMode.HALF_UP),
    outOfPatternCount = outOfPattern.size,
    outOfPatternPnl = outOfPattern.sumOf { (_, profit) -> profit },
    inRulesPnl = inRules.sumOf { (_, profit) -> profit },
  )
}

private fun percentage(part: Int, total: Int): BigDecimal? =
  if (total == 0) null
  else BigDecimal(part * 100).divide(BigDecimal(total), 2, RoundingMode.HALF_UP)

private fun average(sum: BigDecimal, count: Int): BigDecimal? =
  if (count == 0) null else sum.divide(BigDecimal(count), 2, RoundingMode.HALF_UP)
