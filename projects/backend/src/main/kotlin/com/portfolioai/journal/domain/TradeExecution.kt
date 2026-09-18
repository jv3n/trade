package com.portfolioai.journal.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

/**
 * One execution (a single fill) belonging to a [TradeEntry] position. A position is built from an
 * ordered list of executions : one or more [ExecutionKind.ENTRY] fills (each at its own price,
 * since the share price moves while scaling in) and zero or more [ExecutionKind.EXIT] fills. The
 * position aggregates (avg price, realized P&L, gain%) are derived from these rows by
 * [TradePositionCalculator] — the executions are the atomic, source-of-truth data.
 *
 * [seq] is the 0-based saisie/display order within the parent ; unique per parent (DB constraint).
 */
@Entity
@Table(name = "trade_execution")
class TradeExecution(
  @Id val id: UUID = UUID.randomUUID(),

  /** Owning position. `ON DELETE CASCADE` on the FK removes executions with their parent. */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "trade_entry_id", nullable = false)
  var tradeEntry: TradeEntry,
  @Column(nullable = false) var seq: Int,
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column(nullable = false) var kind: ExecutionKind,
  @Column(nullable = false) var shares: Int,
  @Column(nullable = false, precision = 18, scale = 4) var price: BigDecimal,
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
) {
  fun toLeg(): TradePositionCalculator.Leg =
    TradePositionCalculator.Leg(kind = kind, shares = shares, price = price)
}
