package com.portfolioai.stats.application

import com.portfolioai.shared.Pattern
import com.portfolioai.stats.application.dto.StatSummaryDto
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatMetrics
import com.portfolioai.stats.domain.StatReview
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalTime

private val MEDIAN = BigDecimal("0.5")
private val THIRD_QUARTILE = BigDecimal("0.75")

/** The rejection that makes a double top, per `docs/pattern/DT.md` — below, a normal breath. */
private val DT_REJECTION_CRITERION = BigDecimal("17")

/** The DT sheet's entry, −5 % from the top, and the 10 % it promises from there (#706). */
private val DT_ENTRY_FROM_TOP = BigDecimal("0.95")
private val DT_DROP_TARGET = BigDecimal("10")

/** The bell — where a GUS's push and, on a no-push day, its drop are timed from (#713). */
private val MARKET_OPEN: LocalTime = LocalTime.of(9, 30)

/** The drop a GUS needs to have worked : the low end of the sheet's 15-20 % R / R (#713). */
private val GUS_DROP_TARGET = BigDecimal("15")

/**
 * The KPIs of [StatEntryService.summarise] over the filtered [rows] ; [traded] is how many of the
 * counted ones carry a trade. Averages are measured on [pattern]'s stats only, none without one. A
 * scanner stat to review or rejected is only in [StatSummaryDto.toReview] (#762).
 */
internal fun statSummaryOf(
  filtered: List<StatEntry>,
  pattern: Pattern?,
  traded: Int,
): StatSummaryDto {
  val rows = filtered.filter { it.counts }
  val completed = rows.filter { it.isCompleted }
  val measured = if (pattern == null) emptyList() else completed
  val sessions = measured.filterNot { it.isDoubleTop }
  val doubleTops = measured.filter { it.isDoubleTop }
  val drops = doubleTops.filter { it.dtDropPrice != null && it.dtRetestPrice != null }
  val gusDrops = sessions.filter { gusDrop(it) != null }
  val timedPushes = sessions.filter { it.pushOpenTime != null }
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
    doubleTopsTookTopWithoutDrop = doubleTops.count { it.retestTookTop && it.dtDropPrice == null },
    doubleTopsDropNotAsked = doubleTops.count { it.isDoubleTopDropNotAsked },
    doubleTopsDropNotRead = doubleTops.count { it.dropNotRead },
    dropsAfterTookTop = drops.count { it.retestTookTop },
    medianDoubleTopMinutes =
      doubleTops.medianMinutes { StatMetrics.minutesBetween(it.dtStartTime, it.dtRetestTime) },
    medianRejectionMinutes =
      doubleTops.medianMinutes { StatMetrics.minutesBetween(it.dtTopTime, it.dtLowTime) },
    doubleTopsWithDrop = drops.size,
    medianDropPercent =
      drops.medianOf { StatMetrics.percentChange(it.dtRetestPrice, it.dtDropPrice) },
    medianDropFromEntryPercent = drops.medianOf(::dropFromEntry),
    medianDropMinutes =
      drops.medianMinutes { StatMetrics.minutesBetween(it.dtRetestTime, it.dtDropTime) },
    dropReachedTargetCount =
      drops.count { dropFromEntry(it)?.let { change -> change <= -DT_DROP_TARGET } == true },
    sessionsWithDrop = gusDrops.size,
    sessionsDropNotRead = sessions.count { it.dropNotRead },
    medianGusDropPercent = gusDrops.medianOf(::gusDrop),
    gusDropReachedTargetCount =
      gusDrops.count { gusDrop(it)?.let { change -> change <= -GUS_DROP_TARGET } == true },
    sessionsWithPushTime = timedPushes.size,
    medianPushMinutes =
      timedPushes.medianMinutes { StatMetrics.minutesBetween(MARKET_OPEN, it.pushOpenTime) },
    medianGusDropMinutes = gusDrops.medianMinutes { gusDropMinutes(it) },
    traded = traded,
    untraded = rows.size - traded,
    toReview = filtered.count { it.review == StatReview.TO_REVIEW },
  )
}

/** The sheet's entry (top −5 %) → the drop low ; negative when the short gained. */
private fun dropFromEntry(entry: StatEntry): BigDecimal? =
  StatMetrics.percentChange(entry.dtTopPrice?.multiply(DT_ENTRY_FROM_TOP), entry.dtDropPrice)

/** The push's top — the open on a no-push day — → the drop ; negative when the short gained. */
private fun gusDrop(entry: StatEntry): BigDecimal? =
  StatMetrics.percentChange(
    if (entry.noPush) entry.openPrice else entry.pushOpenPrice,
    entry.gusDropPrice,
  )

/** How long the drop took, from the push's top — from the bell on a no-push day. */
private fun gusDropMinutes(entry: StatEntry): Long? =
  StatMetrics.minutesBetween(
    if (entry.noPush) MARKET_OPEN else entry.pushOpenTime,
    entry.gusDropTime,
  )

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
