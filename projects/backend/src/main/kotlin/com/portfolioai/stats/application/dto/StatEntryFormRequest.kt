package com.portfolioai.stats.application.dto

import com.portfolioai.stats.domain.StatSource
import java.math.BigDecimal
import java.time.LocalDate

/**
 * Payload for creating (`POST /api/stats`) or editing (`PUT /api/stats/{id}`) a **user-owned** stat
 * row — used by both the radar one-click « Add stat » (a subset : ticker / gap / open) and the
 * manual « Add » dialog (the full form).
 *
 * - [ticker] — always required. [tradeDate] — optional ; null means "today" (resolved against the
 *   ET market day server-side). Together they are the only mandatory fields of the manual form.
 * - [gapUpPercent], [openPrice] — optional since V5 (the manual form may omit them) ; still always
 *   set by the radar pick and the CSV import.
 * - [source] — optional ; [StatSource.RADAR] for the radar button, [StatSource.MANUAL] (default)
 *   for the dialog. [StatSource.IMPORT] is rejected — only the ADMIN CSV import path can create it.
 * - Everything else — optional setup flags + EOD outcome ; absent (null) on a radar pick, filled on
 *   a complete manual entry. The derived `%push` / `%LOD` / `%EOD` are computed server-side from
 *   the levels (when present), never sent.
 */
data class StatEntryFormRequest(
  val ticker: String,
  val gapUpPercent: BigDecimal? = null,
  val openPrice: BigDecimal? = null,
  val tradeDate: LocalDate? = null,
  val source: StatSource? = null,
  val floatSharesMillions: BigDecimal? = null,
  val institutionsPercent: BigDecimal? = null,
  val instOver20: Boolean? = null,
  val under1Dollar: Boolean? = null,
  val ssr: Boolean? = null,
  val entryAfter11am: Boolean? = null,
  val highPrice: BigDecimal? = null,
  val lodPrice: BigDecimal? = null,
  val eodPrice: BigDecimal? = null,
  val note: String? = null,
)
