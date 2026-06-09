package com.portfolioai.stats.application.dto

import com.portfolioai.stats.domain.StatEntry
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * Response shape for a single [StatEntry] row. Flat — no nested objects, no entity references.
 *
 * Unlike the CSV export (which omits the derived columns to stay roundtrip-safe), the listing DTO
 * **carries** `%push` / `%LOD` / `%EOD` : the table view's whole point is to read those outcomes
 * alongside the setup, and there is no re-import concern on this read path.
 */
data class StatEntryDto(
  val id: UUID,
  val tradeDate: LocalDate,
  val ticker: String,
  val gapUpPercent: BigDecimal,
  val floatSharesMillions: BigDecimal,
  val institutionsPercent: BigDecimal,
  val instOver20: Boolean,
  val under1Dollar: Boolean,
  val ssr: Boolean,
  val entryAfter11am: Boolean,
  val note: String?,
  val openPrice: BigDecimal,
  val highPrice: BigDecimal,
  val lodPrice: BigDecimal,
  val eodPrice: BigDecimal,
  val pushPercent: BigDecimal,
  val lodPercent: BigDecimal,
  val eodPercent: BigDecimal,
  val createdAt: Instant,
  val updatedAt: Instant,
)

fun StatEntry.toDto() =
  StatEntryDto(
    id = id,
    tradeDate = tradeDate,
    ticker = ticker,
    gapUpPercent = gapUpPercent,
    floatSharesMillions = floatSharesMillions,
    institutionsPercent = institutionsPercent,
    instOver20 = instOver20,
    under1Dollar = under1Dollar,
    ssr = ssr,
    entryAfter11am = entryAfter11am,
    note = note,
    openPrice = openPrice,
    highPrice = highPrice,
    lodPrice = lodPrice,
    eodPrice = eodPrice,
    pushPercent = pushPercent,
    lodPercent = lodPercent,
    eodPercent = eodPercent,
    createdAt = createdAt,
    updatedAt = updatedAt,
  )
