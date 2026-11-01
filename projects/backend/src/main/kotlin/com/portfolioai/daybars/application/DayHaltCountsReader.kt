package com.portfolioai.daybars.application

import com.portfolioai.daybars.infrastructure.persistence.DayHaltRepository
import com.portfolioai.stats.domain.DayHaltCounts
import com.portfolioai.stats.domain.TickerDay
import java.time.LocalDate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** The stats' [DayHaltCounts], one query for a whole page of them. */
@Service
class DayHaltCountsReader(private val repo: DayHaltRepository) : DayHaltCounts {

  @Transactional(readOnly = true)
  override fun of(days: Collection<TickerDay>): Map<TickerDay, Int> {
    if (days.isEmpty()) return emptyMap()
    return repo
      .countByDay(days.map { it.tradingDate }.toSet(), days.map { it.ticker }.toSet())
      .associate { (day, ticker, count) ->
        TickerDay(day as LocalDate, ticker as String) to (count as Number).toInt()
      }
  }
}
