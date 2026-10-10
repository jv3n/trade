package com.portfolioai.journal.application

import com.portfolioai.journal.application.dto.JournalDayDto
import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.journal.application.dto.toDto
import com.portfolioai.journal.domain.TradeEntry
import java.math.BigDecimal
import org.springframework.data.domain.Sort

/**
 * Folds trades into the journal's rows — one per ticker and day (#500) — and orders them. Pure, so
 * the grouping and the sort rules are pinned without a database.
 */
object JournalDays {

  /** The trades grouped on (day, ticker), each group's trades in the day's order. */
  fun group(trades: List<TradeEntry>): List<JournalDayDto> =
    trades
      .groupBy { it.tradeDate to it.ticker }
      .values
      .map { day -> rowOf(day.sortedWith(TradeEntry.DAY_ORDER).map { it.toDto() }) }

  private fun rowOf(trades: List<TradeEntryDto>): JournalDayDto {
    val single = trades.singleOrNull()
    return JournalDayDto(
      tradeDate = trades.first().tradeDate,
      ticker = trades.first().ticker,
      patterns = trades.map { it.pattern }.distinct(),
      directions = trades.mapNotNull { it.direction }.distinct(),
      tradeCount = trades.size,
      maxSize = trades.mapNotNull { it.size }.maxOrNull(),
      openPrice = single?.openPrice,
      exitPrice = single?.exitPrice,
      retainedGainPercent = single?.retainedGainPercent,
      durationMinutes = trades.mapNotNull { it.durationMinutes }.takeIf { it.isNotEmpty() }?.sum(),
      retainedProfitDollars =
        trades.mapNotNull { it.retainedProfitDollars }.reduceOrNull(BigDecimal::add),
      enteredLate = trades.any { it.enteredLate == true },
      trades = trades,
    )
  }

  /**
   * The order of the rows for [sort] — its first known property, the empty values last whatever the
   * direction, then the default order to break ties. Without a known property : the latest day
   * first, and within a day the ticker traded last first, as the trade listing did.
   */
  fun comparator(sort: Sort): Comparator<JournalDayDto> {
    val order = sort.firstOrNull { it.property in SORTABLE } ?: return DEFAULT_ORDER
    val key = SORTABLE.getValue(order.property)
    val byKey =
      Comparator<JournalDayDto> { a, b ->
        val x = key(a)
        val y = key(b)
        when {
          x == null && y == null -> 0
          x == null -> 1
          y == null -> -1
          order.isAscending -> x.compareTo(y)
          else -> y.compareTo(x)
        }
      }
    return byKey.then(DEFAULT_ORDER)
  }

  private val DEFAULT_ORDER: Comparator<JournalDayDto> =
    compareByDescending<JournalDayDto> { it.tradeDate }
      .thenByDescending { day -> day.trades.maxOf { it.createdAt } }
      .thenBy { it.ticker }

  @Suppress("UNCHECKED_CAST")
  private val SORTABLE: Map<String, (JournalDayDto) -> Comparable<Any>?> =
    mapOf<String, (JournalDayDto) -> Comparable<*>?>(
        "tradeDate" to { it.tradeDate },
        "ticker" to { it.ticker },
        "tradeCount" to { it.tradeCount },
        "maxSize" to { it.maxSize },
        "openPrice" to { it.openPrice },
        "exitPrice" to { it.exitPrice },
        "retainedGainPercent" to { it.retainedGainPercent },
        "durationMinutes" to { it.durationMinutes },
        "retainedProfitDollars" to { it.retainedProfitDollars },
      )
      .mapValues { (_, key) -> key as (JournalDayDto) -> Comparable<Any>? }
}
