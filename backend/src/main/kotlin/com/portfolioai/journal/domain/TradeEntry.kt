package com.portfolioai.journal.domain

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
 * One trade in the journal. Multi-tenant via [user] (`@ManyToOne` matching the pattern used by
 * [com.portfolioai.portfolio.domain.Portfolio]).
 *
 * Categorical fields ([play], [pattern], [openSide], [exitStrategy]) map to Postgres ENUM types via
 * `@JdbcTypeCode(SqlTypes.NAMED_ENUM)` — Hibernate 6 reads the Postgres enum cast directly without
 * going through a STRING converter. Kotlin enum names must match the Postgres enum values exactly
 * (cf. V5__trade_entry.sql).
 *
 * Exit-side fields ([exitPrice], [profitDollars], [gainPercent]) are nullable while the position is
 * open. Preparation-checklist fields are nullable so a backfilled entry doesn't have to tick every
 * box.
 */
@Entity
@Table(name = "trade_entry")
class TradeEntry(
  @Id val id: UUID = UUID.randomUUID(),

  /** Owner. Multi-tenant scope key — every read path filters on `user.id`. */
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,

  // ---- Identity ----
  @Column(name = "trade_date", nullable = false) var tradeDate: LocalDate,
  @Column(nullable = false, length = 20) var ticker: String,

  // ---- Execution ----
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column(nullable = false) var play: TradePlay,
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column(nullable = false) var pattern: TradePattern,
  @Column(nullable = false) var size: Int,
  @Column(name = "open_price", nullable = false, precision = 18, scale = 4)
  var openPrice: BigDecimal,
  @Column(name = "exit_price", precision = 18, scale = 4) var exitPrice: BigDecimal? = null,
  @Column(name = "profit_dollars", precision = 18, scale = 2) var profitDollars: BigDecimal? = null,
  @Column(name = "gain_percent", precision = 8, scale = 4) var gainPercent: BigDecimal? = null,
  @Column(length = 2000) var note: String? = null,

  // ---- Preparation checklist ----
  @Column(name = "pre_9h35_to_10h") var pre935To10h: Boolean? = null,
  @Column(name = "pre_gap_up_50") var preGapUp50: Boolean? = null,
  @Column(name = "pre_price_1_to_10") var prePrice1To10: Boolean? = null,
  @Column(name = "pre_float_3_to_50m") var preFloat3To50m: Boolean? = null,
  @Column(name = "pre_wait_push") var preWaitPush: Boolean? = null,
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "open_side")
  var openSide: TradeOpenSide? = null,
  @Column(name = "short_on_resistance") var shortOnResistance: Boolean? = null,
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "exit_strategy")
  var exitStrategy: TradeExitStrategy? = null,
  @Column(name = "error_note", length = 2000) var errorNote: String? = null,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
