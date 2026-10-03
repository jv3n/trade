package com.portfolioai.stats.application

import com.portfolioai.shared.Pattern
import com.portfolioai.stats.application.dto.StatSummaryDto
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatMetrics
import java.math.BigDecimal
import java.math.RoundingMode

private val MEDIAN = BigDecimal("0.5")
private val THIRD_QUARTILE = BigDecimal("0.75")

/** The rejection that makes a double top, per `docs/pattern/DT.md` — below, a normal breath. */
private val DT_REJECTION_CRITERION = BigDecimal("17")

/**
 * The KPIs of [StatEntryService.summarise] over the filtered [rows] ; [traded] is how many of them
 * carry a trade. Averages are measured on [pattern]'s stats only, none without one.
 */
internal fun statSummaryOf(rows: List<StatEntry>, pattern: Pattern?, traded: Int): StatSummaryDto {
  val completed = rows.filter { it.isCompleted }
  val measured = if (pattern == null) emptyList() else completed
  val sessions = measured.filterNot { it.isDoubleTop }
  val doubleTops = measured.filter { it.isDoubleTop }
  val pushes = sessions.mapNotNull { StatMetrics.percentVsOpen(it.openPrice, it.pushOpenPrice) }
  return StatSummaryDto(
    completed = completed.size,
    toComplete = rows.size - completed.size,
    averagePushOpenPercent =
      sessions.averageOf { StatMetrics.percentVsOpen(it.openPrice, it.pushOpenPrice) },
    medianPushOpenPercent = StatMetrics.quantile(pushes, MEDIAN),
    thirdQuartilePushOpenPercent = StatMetrics.quantile(pushes, THIRD_QUARTILE),
    maxPushOpenPercent = pushes.maxOrNull(),
    noPushCount = sessions.count { it.noPush },
    medianLodPercent = sessions.medianOf { StatMetrics.percentVsOpen(it.openPrice, it.lodPrice) },
    fadeCount = sessions.count { isBelow(it.eodPrice, it.openPrice) },
    medianEodPercent = sessions.medianOf { StatMetrics.percentVsOpen(it.openPrice, it.eodPrice) },
    medianHoldPercent = sessions.medianOf { StatMetrics.holdPercent(it.pmHigh, it.openPrice) },
    medianCumulativePmHighPercent =
      sessions.medianOf { StatMetrics.cumulativePercent(it.previousClose, it.pmHigh) },
    medianCumulativeOpenPercent =
      sessions.medianOf { StatMetrics.cumulativePercent(it.previousClose, it.openPrice) },
    completedDoubleTops = doubleTops.size,
    averageExtensionPercent =
      doubleTops.averageOf { StatMetrics.percentChange(it.dtStartPrice, it.dtTopPrice) },
    averageExtensionWithGapPercent =
      doubleTops.averageOf { StatMetrics.percentChange(it.previousClose, it.dtTopPrice) },
    averageRejectionPercent =
      doubleTops.averageOf { StatMetrics.percentChange(it.dtTopPrice, it.dtLowPrice) },
    rejectionAtCriterionCount =
      doubleTops.count {
        StatMetrics.percentChange(it.dtTopPrice, it.dtLowPrice)?.let { change ->
          change <= -DT_REJECTION_CRITERION
        } == true
      },
    averageRetestPercent =
      doubleTops.averageOf { StatMetrics.percentChange(it.dtLowPrice, it.dtRetestPrice) },
    averageRetestToTopPercent =
      doubleTops.averageOf { StatMetrics.percentChange(it.dtTopPrice, it.dtRetestPrice) },
    retestTookTopCount = doubleTops.count { isAtLeast(it.dtRetestPrice, it.dtTopPrice) },
    medianDoubleTopMinutes =
      doubleTops.medianMinutes { StatMetrics.minutesBetween(it.dtStartTime, it.dtRetestTime) },
    medianRejectionMinutes =
      doubleTops.medianMinutes { StatMetrics.minutesBetween(it.dtTopTime, it.dtLowTime) },
    traded = traded,
    untraded = rows.size - traded,
  )
}

/** Average of a derived percentage over the rows that yield one ; null when none does. */
private fun List<StatEntry>.averageOf(metric: (StatEntry) -> BigDecimal?): BigDecimal? {
  val values = mapNotNull(metric)
  if (values.isEmpty()) return null
  return values.reduce(BigDecimal::add).divide(BigDecimal(values.size), 2, RoundingMode.HALF_UP)
}

/** Median of a derived percentage over the rows that yield one ; null when none does. */
private fun List<StatEntry>.medianOf(metric: (StatEntry) -> BigDecimal?): BigDecimal? =
  StatMetrics.quantile(mapNotNull(metric), MEDIAN)

/** Median of a duration in minutes over the rows that yield one ; null when none does. */
private fun List<StatEntry>.medianMinutes(metric: (StatEntry) -> Long?): BigDecimal? =
  StatMetrics.quantile(mapNotNull(metric).map(::BigDecimal), MEDIAN)

// A missing price is left out of the count, not thrown on : only `ck_stat_entry_completed_whole`
// (a completed stat holds every session price) keeps these counts exact.
private fun isBelow(price: BigDecimal?, reference: BigDecimal?) =
  price != null && reference != null && price < reference

private fun isAtLeast(price: BigDecimal?, reference: BigDecimal?) =
  price != null && reference != null && price >= reference
