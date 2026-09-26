package com.portfolioai.stats.application.dto

import java.math.BigDecimal

/**
 * KPIs of the stats page, computed over the **filtered set** (not the current page) — the mockup
 * reads them as "September : 10 completed, 1 to complete".
 *
 * Averages and quantiles cover the completed stats only and are whole-number percentages (`9.60` =
 * +9.60 %) ; they are null when no completed stat matches the filter. The session figures read the
 * GUS session, so they leave the double tops out ; the DT figures read the double tops only (#428).
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
 * @param averageLodPercent Average LOD, vs the open.
 * @param fadeCount Completed stats whose EOD closed **below** the open (the GUS thesis playing
 *   out).
 * @param averageEodPercent Average EOD, vs the open.
 * @param completedDoubleTops Completed stats that are double tops — part of [completed].
 * @param averageExtensionPercent Leg A of the double tops : start → top.
 * @param averageExtensionWithGapPercent Leg A counted from the previous close — a gap plus a push
 *   can make 50 % without an intraday 50 %, so the Trading Desk sheet keeps both.
 * @param averageRejectionPercent Leg B : top → rejection low (negative).
 * @param rejectionAtCriterionCount Double tops whose rejection reached the 17 % of the DT sheet —
 *   read against [completedDoubleTops].
 * @param averageRetestPercent Leg C : rejection low → retest.
 * @param averageRetestToTopPercent Where the retest ended against the top (negative = under it).
 * @param retestTookTopCount Double tops whose retest took the top back.
 * @param traded Stats of the filtered set that gave birth to a trade — the journal reads this pair
 *   as « 8 / 10 » and links to the ones left untraded (#195).
 * @param untraded Stats of the filtered set with no trade yet.
 */
data class StatSummaryDto(
  val completed: Int,
  val toComplete: Int,
  val averagePushOpenPercent: BigDecimal?,
  val medianPushOpenPercent: BigDecimal?,
  val thirdQuartilePushOpenPercent: BigDecimal?,
  val maxPushOpenPercent: BigDecimal?,
  val noPushCount: Int,
  val averageLodPercent: BigDecimal?,
  val fadeCount: Int,
  val averageEodPercent: BigDecimal?,
  val completedDoubleTops: Int,
  val averageExtensionPercent: BigDecimal?,
  val averageExtensionWithGapPercent: BigDecimal?,
  val averageRejectionPercent: BigDecimal?,
  val rejectionAtCriterionCount: Int,
  val averageRetestPercent: BigDecimal?,
  val averageRetestToTopPercent: BigDecimal?,
  val retestTookTopCount: Int,
  val traded: Int,
  val untraded: Int,
)
