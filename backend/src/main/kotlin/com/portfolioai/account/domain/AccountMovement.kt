package com.portfolioai.account.domain

import com.portfolioai.auth.domain.User
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

/**
 * One movement in a user's broker cash account. The balance is **derived** (never stored) as the
 * sum of [amount] over all of a user's movements — see `AccountService`. There is no `account`
 * entity in v1 : the account is implicit, one per user, scoped by [user] (`ON DELETE CASCADE`).
 *
 * [amount] is the **signed** effect on the balance (deposits +, withdrawals −, trade P&L and
 * adjustments ±) so `balance = Σ amount` is a plain sum. [type] maps to the Postgres enum
 * `account_movement_type` via `@JdbcTypeCode(NAMED_ENUM)` (same mechanism as `TradeEntry.play`).
 *
 * [tradeEntryId] is non-null **only** for [AccountMovementType.TRADE] movements — the realized P&L
 * pushed from the journal, linked back to its `trade_entry.id` with a DB `ON DELETE CASCADE`.
 * Stored as a plain UUID (not a `@ManyToOne`) so the `account` context doesn't import the `journal`
 * domain entity ; the DB enforces the TRADE ⟺ tradeEntryId-present invariant via a CHECK.
 */
@Entity
@Table(name = "account_movement")
class AccountMovement(
  @Id val id: UUID = UUID.randomUUID(),

  /** Owner. Multi-tenant scope key — every read path filters on `user.id`. */
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,

  /** Immutable — a deposit never morphs into a withdrawal ; change type = delete + recreate. */
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column(nullable = false) val type: AccountMovementType,
  @Column(nullable = false, precision = 18, scale = 2) var amount: BigDecimal,
  @Column(name = "value_date", nullable = false) var valueDate: LocalDate,
  @Column(length = 2000) var note: String? = null,

  /** Set only for TRADE movements (journal link). Null for manual movements. */
  @Column(name = "trade_entry_id") val tradeEntryId: UUID? = null,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
