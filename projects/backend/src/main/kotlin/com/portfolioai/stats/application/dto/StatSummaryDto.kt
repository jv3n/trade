package com.portfolioai.stats.application.dto

import java.math.BigDecimal

/**
 * KPIs of the stats page, computed over the **filtered set** (not the current page) — the mockup
 * reads them as "September : 10 completed, 1 to complete".
 *
 * Averages cover the completed stats only and are whole-number percentages vs the session open
 * (`9.60` = +9.60 %) ; they are null when no completed stat matches the filter.
 *
 * @param completed Number of completed stats matching the filter.
 * @param toComplete Number of stats still waiting for their session block.
 * @param averagePushOpenPercent Average push at open, vs the open.
 * @param averageLodPercent Average LOD, vs the open.
 * @param fadeCount Completed stats whose EOD closed **below** the open (the GUS thesis playing
 *   out).
 * @param averageEodPercent Average EOD, vs the open.
 * @param traded Stats of the filtered set that gave birth to a trade — the journal reads this pair
 *   as « 8 / 10 » and links to the ones left untraded (#195).
 * @param untraded Stats of the filtered set with no trade yet.
 */
data class StatSummaryDto(
  val completed: Int,
  val toComplete: Int,
  val averagePushOpenPercent: BigDecimal?,
  val averageLodPercent: BigDecimal?,
  val fadeCount: Int,
  val averageEodPercent: BigDecimal?,
  val traded: Int,
  val untraded: Int,
)
