package com.portfolioai.daybars.infrastructure.persistence

import com.portfolioai.daybars.domain.DayHalt
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

interface DayHaltRepository : JpaRepository<DayHalt, UUID> {

  fun findByTradingDateAndTickerOrderByHaltedAt(
    tradingDate: LocalDate,
    ticker: String,
  ): List<DayHalt>

  /** A bulk delete : a derived one would run after the inserts of a re-read and hit the unique. */
  @Modifying
  @Query("delete from DayHalt h where h.tradingDate = :tradingDate and h.ticker = :ticker")
  fun deleteDay(tradingDate: LocalDate, ticker: String)

  /** Each row : day, ticker, count. May hold ticker-days beyond the asked pairs ; harmless. */
  @Query(
    """
    select h.tradingDate, h.ticker, count(h)
    from DayHalt h
    where h.tradingDate in :days and h.ticker in :tickers
    group by h.tradingDate, h.ticker
    """
  )
  fun countByDay(days: Collection<LocalDate>, tickers: Collection<String>): List<Array<Any>>
}
