package com.portfolioai.stats.application.dto

import com.portfolioai.journal.application.dto.TradeLinkDto
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.domain.OutOfPatternReason
import com.portfolioai.stats.domain.StatEntry
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

/**
 * Response shape for a single [StatEntry]. Flat — no nested objects, no entity references.
 *
 * Carries the **raw prices only** : gap, premarket push, push at open, HOD / LOD / EOD percentages
 * are derived by the front (`features/stats/stats.math.ts`) from these, exactly like the live
 * preview of the session panel. [completed] is the status the owner ticks (#263) — a stat with its
 * five prices in but not ticked is still "to complete".
 *
 * [trades] mirror the journal side of the stat → trade link (#193), several per stat in the day's
 * order (#500) : empty means the stat has no trade yet and the listing offers the « → Trade »
 * action ; otherwise one tag per trade, labelled by its retained P&L (null while it is open), and
 * « + » for the next one.
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
  // ---- Double top (#428) — null on any other pattern ----
  val dtStartPrice: BigDecimal?,
  val dtTopPrice: BigDecimal?,
  val dtLowPrice: BigDecimal?,
  val dtRetestPrice: BigDecimal?,
  val dtStartTime: LocalTime?,
  val dtTopTime: LocalTime?,
  val dtLowTime: LocalTime?,
  val dtRetestTime: LocalTime?,
  // ---- Flags ----
  val ssr: Boolean,
  val under1Dollar: Boolean,
  val entryAfter11am: Boolean,
  val noPush: Boolean,
  val highInstitutions: Boolean,
  val completed: Boolean,
  /** Why the recorded prices say this was not the setup (#499) — empty when nothing does. */
  val outOfPattern: List<OutOfPatternReason>,
  val trades: List<TradeLinkDto>,
  val createdAt: Instant,
  val updatedAt: Instant,
)

fun StatEntry.toDto(trades: List<TradeLinkDto> = emptyList()) =
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
    dtStartPrice = dtStartPrice,
    dtTopPrice = dtTopPrice,
    dtLowPrice = dtLowPrice,
    dtRetestPrice = dtRetestPrice,
    dtStartTime = dtStartTime,
    dtTopTime = dtTopTime,
    dtLowTime = dtLowTime,
    dtRetestTime = dtRetestTime,
    ssr = ssr,
    under1Dollar = under1Dollar,
    entryAfter11am = entryAfter11am,
    noPush = noPush,
    highInstitutions = highInstitutions,
    completed = isCompleted,
    outOfPattern = outOfPattern,
    trades = trades,
    createdAt = createdAt,
    updatedAt = updatedAt,
  )
