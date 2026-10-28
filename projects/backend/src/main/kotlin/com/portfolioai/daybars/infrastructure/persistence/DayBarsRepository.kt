package com.portfolioai.daybars.infrastructure.persistence

import com.portfolioai.daybars.application.dto.DayTicker
import com.portfolioai.daybars.domain.DayBars
import com.portfolioai.stats.domain.StatReview
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface DayBarsRepository : JpaRepository<DayBars, UUID> {

  fun findByTradingDateAndTicker(tradingDate: LocalDate, ticker: String): DayBars?

  /**
   * The ticker-days of [userId]'s stats before [before] with no bars stored, found or not — newest
   * first, so yesterday's stat gets its chart ahead of an old backlog. A rejected stat needs none.
   */
  @Query(
    """
    select distinct new com.portfolioai.daybars.application.dto.DayTicker(s.tradeDate, s.ticker)
    from StatEntry s
    where s.user.id = :userId
      and s.tradeDate < :before
      and (s.review is null or s.review <> :rejected)
      and not exists (
        select 1 from DayBars b where b.tradingDate = s.tradeDate and b.ticker = s.ticker
      )
    order by s.tradeDate desc, s.ticker
    """
  )
  fun findMissing(
    userId: UUID,
    before: LocalDate,
    page: Pageable,
    rejected: StatReview,
  ): List<DayTicker>
}
