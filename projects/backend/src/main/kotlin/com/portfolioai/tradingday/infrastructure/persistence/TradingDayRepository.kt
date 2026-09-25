package com.portfolioai.tradingday.infrastructure.persistence

import com.portfolioai.tradingday.domain.TradingDay
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/** Multi-tenant on `user.id` : every read scopes on the current user. */
interface TradingDayRepository : JpaRepository<TradingDay, UUID> {

  fun findByUserIdAndTradingDate(userId: UUID, tradingDate: LocalDate): TradingDay?
}
