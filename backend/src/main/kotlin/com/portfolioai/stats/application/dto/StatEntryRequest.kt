package com.portfolioai.stats.application.dto

import java.math.BigDecimal
import java.time.LocalDate

/**
 * Decoded representation of one CSV data row, before the derived percentage columns are computed.
 *
 * Every field here is read straight off the import CSV. Required fields are non-nullable ; only
 * [note] is optional. The percentages ([com.portfolioai.stats.domain.StatEntry.pushPercent] etc.)
 * are NOT part of this request — they are computed at insert time from the price levels.
 */
data class StatEntryRequest(
  val tradeDate: LocalDate,
  val ticker: String,
  val gapUpPercent: BigDecimal,
  val floatSharesMillions: BigDecimal,
  val institutionsPercent: BigDecimal,
  val instOver20: Boolean,
  val under1Dollar: Boolean,
  val ssr: Boolean,
  val entryAfter11am: Boolean,
  val note: String? = null,
  val openPrice: BigDecimal,
  val highPrice: BigDecimal,
  val lodPrice: BigDecimal,
  val eodPrice: BigDecimal,
)
