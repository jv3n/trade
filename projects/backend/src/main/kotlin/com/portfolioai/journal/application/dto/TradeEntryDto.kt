package com.portfolioai.journal.application.dto

import com.portfolioai.journal.domain.TradeDirection
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradePositionCalculator
import com.portfolioai.shared.Pattern
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * Response shape for a single [TradeEntry]. The execution legs are nested in [executions] ; the
 * flat [size] / [openPrice] / [exitPrice] / [profitDollars] / [gainPercent] are the derived
 * aggregates (read-only — recomputed from the executions on every write).
 *
 * The three P&L figures are all exposed so the trade page can show the gap between them (#192) :
 * [profitDollars] computed from the executions, [realProfitDollars] typed from the broker
 * statement, [retainedProfitDollars] the one that reaches the account (real if set, else computed),
 * and [retainedGainPercent] that last one as a percentage of the same cost basis.
 *
 * [durationMinutes] is derived on the fly from the execution times — null while the position is
 * open, or as soon as one end has no time.
 */
data class TradeEntryDto(
  val id: UUID,
  val statEntryId: UUID,
  val tradeDate: LocalDate,
  val ticker: String,
  val pattern: Pattern,
  val direction: TradeDirection?,
  val executions: List<ExecutionDto>,
  val size: Int?,
  val openPrice: BigDecimal?,
  val exitPrice: BigDecimal?,
  val gainPercent: BigDecimal?,
  val profitDollars: BigDecimal?,
  val realProfitDollars: BigDecimal?,
  val retainedProfitDollars: BigDecimal?,
  val retainedGainPercent: BigDecimal?,
  val durationMinutes: Long?,
  val note: String?,
  val errorNote: String?,
  val hasScreenshot: Boolean,
  val createdAt: Instant,
  val updatedAt: Instant,
)

fun TradeEntry.toDto() =
  TradeEntryDto(
    id = id,
    statEntryId = statEntryId,
    tradeDate = tradeDate,
    ticker = ticker,
    pattern = pattern,
    direction = direction,
    executions = executions.map { it.toDto() },
    size = size,
    openPrice = openPrice,
    exitPrice = exitPrice,
    gainPercent = gainPercent,
    profitDollars = profitDollars,
    realProfitDollars = realProfitDollars,
    retainedProfitDollars = retainedProfit,
    retainedGainPercent = retainedGainPercent,
    durationMinutes = TradePositionCalculator.duration(executions.map { it.toLeg() }),
    note = note,
    errorNote = errorNote,
    hasScreenshot = hasScreenshot,
    createdAt = createdAt,
    updatedAt = updatedAt,
  )
