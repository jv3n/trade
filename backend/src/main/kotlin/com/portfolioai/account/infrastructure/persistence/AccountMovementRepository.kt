package com.portfolioai.account.infrastructure.persistence

import com.portfolioai.account.domain.AccountMovement
import java.math.BigDecimal
import java.util.UUID
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

/**
 * Multi-tenant on `user.id` (FK to `app_user`). Every read scopes on the current user — the service
 * never queries the table without a userId filter, and the controller resolves it from the
 * authenticated principal.
 */
interface AccountMovementRepository : JpaRepository<AccountMovement, UUID> {

  fun findByUserId(userId: UUID, pageable: Pageable): Page<AccountMovement>

  fun findByUserId(userId: UUID): List<AccountMovement>

  fun findByIdAndUserId(id: UUID, userId: UUID): AccountMovement?

  /** The single TRADE movement linked to a journal trade, if any (DB partial unique index). */
  fun findByTradeEntryId(tradeEntryId: UUID): AccountMovement?

  /**
   * Current balance = sum of signed amounts for the user. `COALESCE` so an empty account returns 0
   * rather than null.
   */
  @Query("SELECT COALESCE(SUM(m.amount), 0) FROM AccountMovement m WHERE m.user.id = :userId")
  fun balanceFor(userId: UUID): BigDecimal
}
