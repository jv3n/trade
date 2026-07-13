package com.portfolioai.account.infrastructure.persistence

import com.portfolioai.account.domain.AccountMovement
import java.math.BigDecimal
import java.util.UUID
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

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
   * The user's floating correction, if any : the most recent `ADJUSTMENT` carrying a
   * `target_balance` (created via `correctBalance`). This is the row the reconciler re-floats when
   * another line changes. `created_at` desc with an `id` tiebreaker so the pick is deterministic
   * even when two corrections share a timestamp. Pass `Pageable.ofSize(1)` to fetch just the
   * latest.
   *
   * Filters on `target_balance IS NOT NULL` alone — no `type = ADJUSTMENT` predicate. The V10 CHECK
   * (`target_balance IS NULL OR type = 'ADJUSTMENT'`) makes a non-null target imply an ADJUSTMENT,
   * so the type test is redundant. It also *must* be omitted : a JPQL `m.type = …ADJUSTMENT` makes
   * Hibernate emit `cast(? as accountmovementtype)`, a type name that doesn't exist (the Postgres
   * enum is `account_movement_type`) → `SQLGrammarException`. Filtering on the target sidesteps the
   * cast.
   */
  @Query(
    "SELECT m FROM AccountMovement m " +
      "WHERE m.user.id = :userId " +
      "AND m.targetBalance IS NOT NULL " +
      "ORDER BY m.createdAt DESC, m.id DESC"
  )
  fun findLatestCorrection(@Param("userId") userId: UUID, pageable: Pageable): List<AccountMovement>

  /**
   * Current balance = sum of signed amounts for the user. `COALESCE` so an empty account returns 0
   * rather than null.
   */
  @Query("SELECT COALESCE(SUM(m.amount), 0) FROM AccountMovement m WHERE m.user.id = :userId")
  fun balanceFor(userId: UUID): BigDecimal
}
