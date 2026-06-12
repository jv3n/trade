package com.portfolioai.stats.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One trade-stats row — the pre-trade setup context plus the day's price levels. Distinct from
 * [com.portfolioai.journal.domain.TradeEntry] (the execution journal) : this table is all numeric /
 * boolean and is fed either by a CSV import or by a radar « Add stat » pick.
 *
 * **Two provenance paths since V2** ([source]) :
 * - [StatSource.IMPORT] — ADMIN CSV import. Complete rows ([createdBy] = null) ; the global, shared
 *   dataset readable by every authenticated user.
 * - [StatSource.RADAR] — a user pressed « Add stat ». A **partial** row owned by [createdBy] and
 *   visible only to them (plus the global IMPORT rows). Only [tradeDate], [ticker], [gapUpPercent]
 *   and [openPrice] are known at scan time ; the setup flags + the EOD outcome stay null.
 *
 * **Nullability** — everything except identity ([tradeDate], [ticker]) and the always-known scan
 * fields ([gapUpPercent], [openPrice]) is nullable so a radar pick stores NULL rather than a
 * misleading 0. The setup + level columns are entered by hand in the import CSV ; the three
 * percentage columns ([pushPercent], [lodPercent], [eodPercent]) are **derived at insert time** by
 * [StatMetrics] from the levels — never read off the CSV — so they are null exactly when the levels
 * they derive from are.
 */
@Entity
@Table(name = "stat_entry")
class StatEntry(
  @Id val id: UUID = UUID.randomUUID(),

  // ---- Identity ----
  @Column(name = "trade_date", nullable = false) var tradeDate: LocalDate,
  @Column(nullable = false, length = 20) var ticker: String,

  // ---- Always known at creation (radar + CSV) — percentages in value encoding (52.00 = 52%) ----
  @Column(name = "gap_up_percent", nullable = false, precision = 8, scale = 2)
  var gapUpPercent: BigDecimal,
  @Column(name = "open_price", nullable = false, precision = 18, scale = 4)
  var openPrice: BigDecimal,

  // ---- Setup (manually entered via CSV) — null on a radar pick ----
  @Column(name = "float_shares_millions", precision = 12, scale = 2)
  var floatSharesMillions: BigDecimal? = null,
  @Column(name = "institutions_percent", precision = 5, scale = 2)
  var institutionsPercent: BigDecimal? = null,
  @Column(name = "inst_over_20") var instOver20: Boolean? = null,
  @Column(name = "under_1_dollar") var under1Dollar: Boolean? = null,
  @Column var ssr: Boolean? = null,
  @Column(name = "entry_after_11am") var entryAfter11am: Boolean? = null,
  @Column(length = 2000) var note: String? = null,

  // ---- Price levels (EOD outcome, manually entered via CSV) — null on a radar pick ----
  @Column(name = "high_price", precision = 18, scale = 4) var highPrice: BigDecimal? = null,
  @Column(name = "lod_price", precision = 18, scale = 4) var lodPrice: BigDecimal? = null,
  @Column(name = "eod_price", precision = 18, scale = 4) var eodPrice: BigDecimal? = null,

  // ---- Derived at insert (StatMetrics) — value ×100, 2 decimals, null when the levels are ----
  @Column(name = "push_percent", precision = 8, scale = 2) var pushPercent: BigDecimal? = null,
  @Column(name = "lod_percent", precision = 8, scale = 2) var lodPercent: BigDecimal? = null,
  @Column(name = "eod_percent", precision = 8, scale = 2) var eodPercent: BigDecimal? = null,

  // ---- Provenance + ownership (V2) ----
  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 16)
  var source: StatSource = StatSource.IMPORT,
  /** Owning user. Null = the admin/global curated dataset (CSV import), readable by everyone. */
  @Column(name = "created_by") var createdBy: UUID? = null,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
