package com.portfolioai.stats.application.dto

import java.math.BigDecimal
import java.time.LocalDate

/**
 * Payload of the radar « Add stat » button (`POST /api/stats`). Only the fields a radar pick knows
 * at scan time : the ticker, its gap-up % and the open price (the radar's current price).
 * Everything else on a [com.portfolioai.stats.domain.StatEntry] — float, institutions, the EOD
 * outcome — is unknown until the day plays out, so it is left null and filled later.
 *
 * [tradeDate] is optional : absent means "today" (the common case — you add the stat the morning
 * you spot it), resolved server-side against the ET market day in
 * [com.portfolioai.stats.application .StatEntryService].
 */
data class StatRadarCreateRequest(
  val ticker: String,
  val gapUpPercent: BigDecimal,
  val openPrice: BigDecimal,
  val tradeDate: LocalDate? = null,
)
