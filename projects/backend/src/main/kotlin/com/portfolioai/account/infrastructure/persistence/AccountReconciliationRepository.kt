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
}
