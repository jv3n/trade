package com.portfolioai.stats.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One trade-stats row — the pre-trade setup context plus the day's price levels. Distinct from
 * [com.portfolioai.journal.domain.TradeEntry] (the execution journal) : this table is all numeric /
 * boolean and is fed by a CSV import rather than per-trade CRUD.
 *
 * **Global dataset** — unlike `TradeEntry`, stats are NOT multi-tenant : there is no `user_id`. The
 * rows are a single shared dataset readable by every authenticated user ; only ADMINs may mutate it
 * (the CSV import is gated by `hasRole("ADMIN")` on the stats POST routes in `SecurityConfig`).
 *
 * The setup + level columns are entered by hand in the source CSV. The three percentage columns
 * ([pushPercent], [lodPercent], [eodPercent]) are **derived at insert time** by [StatMetrics] —
 * never read off the CSV. They use value ×100 encoding with 2 decimals, matching the Postgres
 * `NUMERIC(8,2)` columns, and can be negative when the price fell below the open.
 */
@Entity
@Table(name = "stat_entry")
class StatEntry(
  @Id val id: UUID = UUID.randomUUID(),

  // ---- Identity ----
  @Column(name = "trade_date", nullable = false) var tradeDate: LocalDate,
  @Column(nullable = false, length = 20) var ticker: String,

  // ---- Setup (manually entered) — percentages in value encoding (52.00 = 52%) ----
  @Column(name = "gap_up_percent", nullable = false, precision = 8, scale = 2)
  var gapUpPercent: BigDecimal,
  @Column(name = "float_shares_millions", nullable = false, precision = 12, scale = 2)
  var floatSharesMillions: BigDecimal,
  @Column(name = "institutions_percent", nullable = false, precision = 5, scale = 2)
  var institutionsPercent: BigDecimal,
  @Column(name = "inst_over_20", nullable = false) var instOver20: Boolean,
  @Column(name = "under_1_dollar", nullable = false) var under1Dollar: Boolean,
  @Column(nullable = false) var ssr: Boolean,
  @Column(name = "entry_after_11am", nullable = false) var entryAfter11am: Boolean,
  @Column(length = 2000) var note: String? = null,

  // ---- Price levels (manually entered) ----
  @Column(name = "open_price", nullable = false, precision = 18, scale = 4)
  var openPrice: BigDecimal,
  @Column(name = "high_price", nullable = false, precision = 18, scale = 4)
  var highPrice: BigDecimal,
  @Column(name = "lod_price", nullable = false, precision = 18, scale = 4) var lodPrice: BigDecimal,
  @Column(name = "eod_price", nullable = false, precision = 18, scale = 4) var eodPrice: BigDecimal,

  // ---- Derived at insert (StatMetrics) — value ×100, 2 decimals, can be negative ----
  @Column(name = "push_percent", nullable = false, precision = 8, scale = 2)
  var pushPercent: BigDecimal,
  @Column(name = "lod_percent", nullable = false, precision = 8, scale = 2)
  var lodPercent: BigDecimal,
  @Column(name = "eod_percent", nullable = false, precision = 8, scale = 2)
  var eodPercent: BigDecimal,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
