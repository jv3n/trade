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

/**
 * One morning's reconciliation between the app's derived balance and the balance TradeZero displays
 * (#198). One row per user per day — reconciling twice the same morning overwrites it, because it
 * is one decision, not two.
 *
 * [gap] is `brokerBalance − appBalance` **as it was that morning**, kept as a stored figure : once
 * the correction has moved the balance, recomputing it would always yield zero and the history
 * would claim every morning was clean.
 *
 * [correctionId] points at the `ADJUSTMENT` this morning produced, and is null on a clean morning —
 * which is exactly what this table exists for : before it, a gap-free reconciliation left no trace
 * at all. It also goes back to null if that movement is later deleted (`ON DELETE SET NULL`) : the
 * reconciliation still happened.
 */
@Entity
@Table(name = "account_reconciliation")
class AccountReconciliation(
  @Id val id: UUID = UUID.randomUUID(),

  /** Owner. Multi-tenant scope key — every read path filters on `user.id`. */
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,

  /** The morning being reconciled — unique per user. */
  @Column(name = "value_date", nullable = false) val valueDate: LocalDate,
  @Column(name = "broker_balance", nullable = false, precision = 18, scale = 2)
  var brokerBalance: BigDecimal,

  /** The app's derived balance before any correction — what the two figures were compared on. */
  @Column(name = "app_balance", nullable = false, precision = 18, scale = 2)
  var appBalance: BigDecimal,
  @Column(nullable = false, precision = 18, scale = 2) var gap: BigDecimal,

  /** The `ADJUSTMENT` movement this reconciliation created, when there was a gap to absorb. */
  @Column(name = "correction_id") var correctionId: UUID? = null,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
