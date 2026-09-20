package com.portfolioai.account.infrastructure.persistence

import com.portfolioai.account.domain.AccountReconciliation
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository

/**
 * Multi-tenant on `user.id` (FK to `app_user`), like every other read path of the account module.
 * The history reads latest-first ; the day lookup backs the "already reconciled this morning ?"
 * question the Today page asks.
 */
interface AccountReconciliationRepository : JpaRepository<AccountReconciliation, UUID> {

  fun findByUserIdAndValueDate(userId: UUID, valueDate: LocalDate): AccountReconciliation?

  fun findByUserIdOrderByValueDateDesc(
    userId: UUID,
    pageable: Pageable,
  ): List<AccountReconciliation>

  fun findByIdAndUserId(id: UUID, userId: UUID): AccountReconciliation?

  /**
   * The morning a correction belongs to, if any. Deleting that `ADJUSTMENT` on its own must take
   * the reconciliation with it (#249) : the DB's `ON DELETE SET NULL` would otherwise leave a row
   * describing a correction that no longer exists.
   */
  fun findByCorrectionId(correctionId: UUID): AccountReconciliation?
}
