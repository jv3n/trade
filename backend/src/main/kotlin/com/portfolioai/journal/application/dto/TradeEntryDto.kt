package com.portfolioai.journal.application.dto

import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradeExitStrategy
import com.portfolioai.journal.domain.TradeOpenSide
import com.portfolioai.journal.domain.TradePattern
import com.portfolioai.journal.domain.TradePlay
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** Response shape for a single [TradeEntry]. Flat — no nested objects, no entity references. */
data class TradeEntryDto(
  val id: UUID,
  val tradeDate: LocalDate,
  val ticker: String,
  val play: TradePlay?,
  val pattern: TradePattern?,
  val size: Int?,
  val openPrice: BigDecimal?,
  val exitPrice: BigDecimal?,
  val profitDollars: BigDecimal?,
  val gainPercent: BigDecimal?,
  val note: String?,
  val pre935To10h: Boolean?,
  val preGapUp50: Boolean?,
  val prePrice1To10: Boolean?,
  val preFloat3To50m: Boolean?,
  val preWaitPush: Boolean?,
  val openSide: TradeOpenSide?,
  val shortOnResistance: Boolean?,
  val exitStrategy: TradeExitStrategy?,
  val errorNote: String?,
  val statEntryId: UUID?,
  val createdAt: Instant,
  val updatedAt: Instant,
)

fun TradeEntry.toDto() =
  TradeEntryDto(
    id = id,
    tradeDate = tradeDate,
    ticker = ticker,
    play = play,
    pattern = pattern,
    size = size,
    openPrice = openPrice,
    exitPrice = exitPrice,
    profitDollars = profitDollars,
    gainPercent = gainPercent,
    note = note,
    pre935To10h = pre935To10h,
    preGapUp50 = preGapUp50,
    prePrice1To10 = prePrice1To10,
    preFloat3To50m = preFloat3To50m,
    preWaitPush = preWaitPush,
    openSide = openSide,
    shortOnResistance = shortOnResistance,
    exitStrategy = exitStrategy,
    errorNote = errorNote,
    statEntryId = statEntryId,
    createdAt = createdAt,
    updatedAt = updatedAt,
  )
