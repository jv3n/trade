package com.portfolioai.stats.application.dto

import com.portfolioai.journal.application.dto.TradeLinkDto
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.domain.StatEntry
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * Response shape for a single [StatEntry]. Flat — no nested objects, no entity references.
 *
 * Carries the **raw prices only** : gap, premarket push, push at open, HOD / LOD / EOD percentages
 * are derived by the front (`features/stats/stats.math.ts`) from these, exactly like the live
 * preview of the session panel. [completed] is the status the owner ticks (#263) — a stat with its
 * five prices in but not ticked is still "to complete".
 *
 * [tradeId] / [tradeRetainedProfitDollars] mirror the journal side of the stat → trade link (#193)
 * : null means the stat has no trade yet and the listing offers the « → Trade » action ; non-null
 * means it shows a link to that trade instead, labelled by its retained P&L (itself null while the
 * position is open).
 */
data class StatEntryDto(
  val id: UUID,
  val candidateId: UUID?,
  val tradeDate: LocalDate,
  val pattern: Pattern,
  val ticker: String,
  // ---- Premarket (copied from the candidate) ----
  val previousClose: BigDecimal,
  val pmOpen: BigDecimal,
  val pmHigh: BigDecimal,
  val floatMillions: BigDecimal?,
  val volumeMillions: BigDecimal?,
  val locatePerShare: BigDecimal?,
  val note: String?,
  // ---- Session (typed as the day goes — any of them may still be null) ----
  val openPrice: BigDecimal?,
  val pushOpenPrice: BigDecimal?,
  val hodPrice: BigDecimal?,
  val lodPrice: BigDecimal?,
  val eodPrice: BigDecimal?,
  // ---- Flags ----
  val ssr: Boolean,
  val under1Dollar: Boolean,
  val entryAfter11am: Boolean,
  val noPush: Boolean,
  val lowInstitutions: Boolean,
  val completed: Boolean,
  val tradeId: UUID?,
  val tradeRetainedProfitDollars: BigDecimal?,
  val createdAt: Instant,
  val updatedAt: Instant,
)

fun StatEntry.toDto(tradeLink: TradeLinkDto? = null) =
  StatEntryDto(
    id = id,
    candidateId = candidateId,
    tradeDate = tradeDate,
    pattern = pattern,
    ticker = ticker,
    previousClose = previousClose,
    pmOpen = pmOpen,
    pmHigh = pmHigh,
    floatMillions = floatMillions,
    volumeMillions = volumeMillions,
    locatePerShare = locatePerShare,
    note = note,
    openPrice = openPrice,
    pushOpenPrice = pushOpenPrice,
    hodPrice = hodPrice,
    lodPrice = lodPrice,
    eodPrice = eodPrice,
    ssr = ssr,
    under1Dollar = under1Dollar,
    entryAfter11am = entryAfter11am,
    noPush = noPush,
    lowInstitutions = lowInstitutions,
    completed = isCompleted,
    tradeId = tradeLink?.tradeId,
    tradeRetainedProfitDollars = tradeLink?.retainedProfitDollars,
    createdAt = createdAt,
    updatedAt = updatedAt,
  )
