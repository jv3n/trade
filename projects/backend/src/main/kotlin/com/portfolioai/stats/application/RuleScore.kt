package com.portfolioai.stats.application

import com.portfolioai.stats.application.dto.RuleScoreDto
import com.portfolioai.stats.application.dto.RuleScoreRowDto
import com.portfolioai.stats.domain.MechanicalRule
import com.portfolioai.stats.domain.RuleTrade
import com.portfolioai.stats.domain.StatEntry
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate

/** The windows the rules are scored over (#205), in months — 12 is the year. */
val RULE_SCORE_MONTHS: Set<Int> = setOf(1, 2, 3, 6, 12)

/** [StatEntryService.scoreRules] over the completed GUS [rows] of [dateFrom] → [dateTo]. */
internal fun ruleScoreOf(rows: List<StatEntry>, dateFrom: LocalDate, dateTo: LocalDate) =
  RuleScoreDto(
    dateFrom = dateFrom,
    dateTo = dateTo,
    completed = rows.size,
    rules = MechanicalRule.entries.map { rule -> rowOf(rule, rows.mapNotNull(rule::replay)) },
  )

private fun rowOf(rule: MechanicalRule, trades: List<RuleTrade>) =
  trades
    .partition { it.isWin }
    .let { (wins, losses) ->
      val averageWin = wins.map { it.profitPercent }.average()
      val averageLoss = losses.map { it.profitPercent }.average()
      RuleScoreRowDto(
        rule = rule,
        entryPercent = rule.entryPercent,
        stopPercent = rule.stopPercent,
        triggered = trades.size,
        stopped = trades.count { it.stopped },
        wins = wins.size,
        averageWinPercent = averageWin,
        averageLossPercent = averageLoss,
        winLossRatio =
          if (averageWin == null || averageLoss == null || averageLoss.signum() == 0) null
          else averageWin.divide(averageLoss.abs(), 2, RoundingMode.HALF_UP),
        expectancyPercent = trades.map { it.profitPercent }.average(),
      )
    }

private fun List<BigDecimal>.average(): BigDecimal? =
  if (isEmpty()) null else reduce(BigDecimal::add).divide(BigDecimal(size), 2, RoundingMode.HALF_UP)
