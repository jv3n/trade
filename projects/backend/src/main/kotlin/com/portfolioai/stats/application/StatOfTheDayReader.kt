package com.portfolioai.stats.application

import com.portfolioai.journal.domain.StatOfTheDay
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.time.LocalDate
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** The journal's [StatOfTheDay], read off the stat's natural key. */
@Service
class StatOfTheDayReader(private val repo: StatEntryRepository) : StatOfTheDay {

  @Transactional(readOnly = true)
  override fun find(userId: UUID, tradeDate: LocalDate, ticker: String, pattern: Pattern): UUID? =
    repo.findByUserIdAndTradeDateAndTickerAndPattern(userId, tradeDate, ticker, pattern)?.id
}
