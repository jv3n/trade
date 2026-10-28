package com.portfolioai.daybars.infrastructure.persistence

import com.portfolioai.daybars.domain.DayBars
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface DayBarsRepository : JpaRepository<DayBars, UUID> {

  fun findByTradingDateAndTicker(tradingDate: LocalDate, ticker: String): DayBars?
}
