package com.portfolioai.stats.application.dto

import java.math.BigDecimal

/**
 * KPIs of the stats page, computed over the **filtered set** (not the current page) — the mockup
 * reads them as "September : 10 completed, 1 to complete".
 *
 * Medians, averages and quantiles cover the completed stats only and are whole-number percentages
 * (`9.60` = +9.60 %) ; they are null when no completed stat matches the filter. The session cards
 * read **medians** (#499) : one or two big movers dragged the averages by up to 7 points. The
 * session figures read the GUS session, so they leave the double tops out ; the DT figures read the
 * double tops only (#428).
 *
 * @param completed Number of completed stats matching the filter.
 * @param toComplete Number of stats still waiting for their session block.
 * @param averagePushOpenPercent Average push at open, vs the open — over the stats that pushed : a
 *   « no push » day has no push price, so it doesn't drag the average (nor the quantiles) down.
 * @param medianPushOpenPercent Median push at open — with the 3rd quartile and the max, the
 *   references the candidates' « À l'open » card offers next to the average (#261).
 * @param thirdQuartilePushOpenPercent 3rd quartile of the push at open.
 * @param maxPushOpenPercent Largest push at open.
 * @param noPushCount Completed stats ticked « no push » (#302) — read against [completed].
 * @param medianLodPercent Median LOD, vs the open.
 * @param fadeCount Completed stats whose EOD closed **below** the open (the GUS thesis playing
 *   out).
 * @param medianEodPercent Median EOD, vs the open.
 * @param medianHoldPercent Median hold, PM high → open (#499) : what survives of the premarket.
 * @param medianCumulativePmHighPercent Median previous close → PM high — the highest the scanner
 *   showed that morning.
 * @param medianCumulativeOpenPercent Median previous close → open — what the scanner still showed
 *   at the bell.
 * @param completedDoubleTops Completed stats that are double tops — part of [completed].
 * @param averageExtensionPercent Leg A of the double tops : start → top.
 * @param averageRejectionPercent Leg B : top → rejection low (negative).
 * @param rejectionAtCriterionCount Double tops whose rejection reached the 17 % of the DT sheet —
 *   read against [completedDoubleTops].
 * @param averageRetestPercent Leg C : rejection low → retest.
 * @param averageRetestToTopPercent Where the retest ended against the top (negative = under it).
 * @param retestTookTopCount Double tops whose retest took the top back.
 * @param doubleTopsTookTopWithoutDrop Completed double tops whose retest took the top and that have
 *   no drop — nothing to measure (#710).
 * @param doubleTopsDropNotAsked Completed double tops under their top with no drop, recorded before
 *   the drop was asked (#726).
 * @param doubleTopsDropNotRead Completed double tops whose drop is marked as not read (#729). With
 *   [doubleTopsWithDrop], [doubleTopsTookTopWithoutDrop] and [doubleTopsDropNotAsked], it makes up
 *   [completedDoubleTops] — each DT in exactly one of the four.
 * @param medianDoubleTopMinutes Median duration of the completed double tops, start → retest, in
 *   minutes (#469) — a median, not a mean : one DT that drags all afternoon would move an average
 *   and say nothing about the typical one. Read against [completedDoubleTops].
 * @param medianRejectionMinutes Median of leg B, top → rejection low — how fast the rejection
 *   comes, the leg the entry depends on.
 * @param doubleTopsWithDrop Completed double tops whose drop after the retest is typed (#706) — the
 *   `n` of the four drop figures, read against [completedDoubleTops].
 * @param dropsAfterTookTop Of [doubleTopsWithDrop], those whose retest took the top and that fell
 *   all the same — a separate axis, not a slice beside them (#729).
 * @param medianDropPercent Median leg D, retest → drop low. Negative : the price fell, which is the
 *   short's gain — the front flips the sign to show it as one.
 * @param medianDropFromEntryPercent Median drop from the DT sheet's entry (top −5 %) → drop low —
 *   what the entry rule captured. Not a backtest : the stop may have been hit first.
 * @param medianDropMinutes Median duration of leg D, retest → drop low.
 * @param dropReachedTargetCount Drops that gave at least the 10 % the sheet promises from its entry
 *   — read against [doubleTopsWithDrop].
 * @param sessionsWithDrop Completed GUS whose drop is typed (#713) — the `n` of the GUS drop
 *   figures, read against the completed GUS : the drop is optional.
 * @param medianGusDropPercent Median drop from the push's top — the open on a no-push day — to the
 *   drop. Negative : the price fell, the short's gain ; the front flips the sign.
 * @param gusDropReachedTargetCount Drops of at least 15 % — the low end of the GUS sheet's R / R —
 *   read against [sessionsWithDrop].
 * @param sessionsDropNotRead Completed GUS whose drop is marked as not read (#729) — the rest of
 *   the completed GUS without a drop is still to fill.
 * @param sessionsWithPushTime Completed GUS whose push time is typed — the `n` of
 *   [medianPushMinutes], apart from [sessionsWithDrop] : the history has push prices and no times.
 * @param medianPushMinutes Median time from the bell to the push's top, in minutes.
 * @param medianGusDropMinutes Median duration of the drop, from the push's top (the bell on a
 *   no-push day).
 * @param traded Stats of the filtered set that gave birth to a trade — the journal reads this pair
 *   as « 8 / 10 » and links to the ones left untraded (#195).
 * @param untraded Stats of the filtered set with no trade yet.
 * @param toReview Scanner stats of the filtered set still to review (#762) — in none of the figures
 *   above, the « 2 à relire, hors chiffres » of the KPIs.
 */
data class StatSummaryDto(
  val completed: Int,
  val toComplete: Int,
  val averagePushOpenPercent: BigDecimal?,
  val medianPushOpenPercent: BigDecimal?,
  val thirdQuartilePushOpenPercent: BigDecimal?,
  val maxPushOpenPercent: BigDecimal?,
  val noPushCount: Int,
  val medianLodPercent: BigDecimal?,
  val fadeCount: Int,
  val medianEodPercent: BigDecimal?,
  val medianHoldPercent: BigDecimal?,
  val medianCumulativePmHighPercent: BigDecimal?,
  val medianCumulativeOpenPercent: BigDecimal?,
  val completedDoubleTops: Int,
  val averageExtensionPercent: BigDecimal?,
  val averageRejectionPercent: BigDecimal?,
  val rejectionAtCriterionCount: Int,
  val averageRetestPercent: BigDecimal?,
  val averageRetestToTopPercent: BigDecimal?,
  val retestTookTopCount: Int,
  val doubleTopsTookTopWithoutDrop: Int,
  val doubleTopsDropNotAsked: Int,
  val doubleTopsDropNotRead: Int,
  val medianDoubleTopMinutes: BigDecimal?,
  val medianRejectionMinutes: BigDecimal?,
  val doubleTopsWithDrop: Int,
  val dropsAfterTookTop: Int,
  val medianDropPercent: BigDecimal?,
  val medianDropFromEntryPercent: BigDecimal?,
  val medianDropMinutes: BigDecimal?,
  val dropReachedTargetCount: Int,
  val sessionsWithDrop: Int,
  val sessionsDropNotRead: Int,
  val medianGusDropPercent: BigDecimal?,
  val gusDropReachedTargetCount: Int,
  val sessionsWithPushTime: Int,
  val medianPushMinutes: BigDecimal?,
  val medianGusDropMinutes: BigDecimal?,
  val traded: Int,
  val untraded: Int,
  val toReview: Int,
)
