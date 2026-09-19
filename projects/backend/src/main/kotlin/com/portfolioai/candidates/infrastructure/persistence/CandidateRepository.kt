package com.portfolioai.candidates.infrastructure.persistence

import com.portfolioai.candidates.domain.Candidate
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/**
 * Multi-tenant on `user.id` (FK to `app_user`). Every read scopes on the current user — the service
 * never queries the table without a userId filter. The page lists one day at a time
 * ([findByUserIdAndTradingDateOrderByTickerAsc]).
 */
interface CandidateRepository : JpaRepository<Candidate, UUID> {

  fun findByUserIdAndTradingDateOrderByTickerAsc(
    userId: UUID,
    tradingDate: LocalDate,
  ): List<Candidate>

  fun findByIdAndUserId(id: UUID, userId: UUID): Candidate?

  /** Natural-key lookup behind the 409 : one candidate per (user, day, ticker). */
  fun findByUserIdAndTradingDateAndTicker(
    userId: UUID,
    tradingDate: LocalDate,
    ticker: String,
  ): Candidate?
}
