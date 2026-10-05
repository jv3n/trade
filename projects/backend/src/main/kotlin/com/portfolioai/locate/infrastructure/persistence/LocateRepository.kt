package com.portfolioai.locate.infrastructure.persistence

import com.portfolioai.locate.domain.Locate
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/** Multi-tenant on `user.id` : every read scopes on the current user. */
interface LocateRepository : JpaRepository<Locate, UUID> {

  fun findByIdAndUserId(id: UUID, userId: UUID): Locate?

  fun findByUserIdAndTradingDateOrderByCreatedAt(userId: UUID, tradingDate: LocalDate): List<Locate>

  fun findByUserIdAndTradingDateAndTickerOrderByCreatedAt(
    userId: UUID,
    tradingDate: LocalDate,
    ticker: String,
  ): List<Locate>
}
