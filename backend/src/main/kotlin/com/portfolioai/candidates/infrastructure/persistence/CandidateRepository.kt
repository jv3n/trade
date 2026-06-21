package com.portfolioai.candidates.infrastructure.persistence

import com.portfolioai.candidates.domain.Candidate
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/**
 * Multi-tenant on `user.id` (FK to `app_user`). Every read scopes on the current user — the service
 * never queries the table without a userId filter. The cockpit's dropdown is fed by
 * [findByUserIdAndTradingDateOrderByTickerAsc] (a single session's candidates only — the
 * date-driven lifecycle hides older rows without deleting them).
 */
interface CandidateRepository : JpaRepository<Candidate, UUID> {

  fun findByUserIdAndTradingDateOrderByTickerAsc(
    userId: UUID,
    tradingDate: LocalDate,
  ): List<Candidate>

  fun findByIdAndUserId(id: UUID, userId: UUID): Candidate?

  /** Natural-key lookup for the save upsert : one candidate per (user, session, ticker). */
  fun findByUserIdAndTradingDateAndTicker(
    userId: UUID,
    tradingDate: LocalDate,
    ticker: String,
  ): Candidate?
}
