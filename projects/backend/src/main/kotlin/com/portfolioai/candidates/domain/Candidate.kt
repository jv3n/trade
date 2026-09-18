package com.portfolioai.candidates.domain

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
 * One short-trade candidate prepared for a session — the persisted backing of the candidates
 * cockpit (risk-based entry ladder + live execution tracker + cover ladder + GUS / borrow context).
 * One row per ticker the trader sets up ; scoped by [user] (`ON DELETE CASCADE`).
 *
 * The **lifecycle is date-driven** : [tradingDate] decides visibility — the cockpit's dropdown only
 * lists the current day's candidates, older ones are implicitly closed (kept for history, off the
 * picker). There is no status column by design.
 *
 * The ladders are low-cardinality, candidate-local arrays so they ride as JSON rather than child
 * tables : [fillsJson] is a `List<CandidateFill>` (shares actually short per rung), [entriesJson] a
 * `List<CandidateEntry>` (free-form short entry legs feeding the average position) and [exitsJson]
 * a `List<CandidateExit>` (planned / executed cover legs). All map to Postgres `jsonb` as a String
 * via `@JdbcTypeCode(SqlTypes.JSON)` — marshalling to/from typed objects is the service's job, same
 * convention as `ScreenerSnapshotDay.moversJson` / `TickerNarrativeSnapshot`.
 *
 * Percentages are stored as whole numbers (`5.00` = 5 %, `40.00` = 40 %) ; the front converts to a
 * fraction where the math needs it. Derived figures (ladder, totals, residual, gains) are never
 * stored — they are recomputed client-side from these saved inputs.
 */
@Entity
@Table(name = "candidate")
class Candidate(
  @Id val id: UUID = UUID.randomUUID(),

  /** Owner. Multi-tenant scope key — every read path filters on `user.id`. */
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,

  /** Session date — drives dropdown visibility (today = active, past = closed). */
  @Column(name = "trading_date", nullable = false) var tradingDate: LocalDate,
  @Column(nullable = false, length = 20) var ticker: String,

  // ---- Risk parameters ----
  @Column(name = "total_capital", nullable = false, precision = 18, scale = 2)
  var totalCapital: BigDecimal,
  @Column(name = "pct_capital_at_risk", nullable = false, precision = 6, scale = 2)
  var pctCapitalAtRisk: BigDecimal,
  @Column(name = "open_price", nullable = false, precision = 18, scale = 4)
  var openPrice: BigDecimal,
  @Column(name = "stop_pct", precision = 6, scale = 2) var stopPct: BigDecimal? = null,

  // ---- Market context (entered by hand — no provider in v1) ----
  @Column(name = "previous_close", precision = 18, scale = 4) var previousClose: BigDecimal? = null,
  @Column(name = "float_shares", precision = 18, scale = 2) var floatShares: BigDecimal? = null,
  @Column(precision = 18, scale = 2) var volume: BigDecimal? = null,
  @Column(name = "morning_push", precision = 18, scale = 4) var morningPush: BigDecimal? = null,
  @Column(name = "borrow_cost_per_share", precision = 18, scale = 4)
  var borrowCostPerShare: BigDecimal? = null,

  // ---- Ladders (JSON — marshalled in the application layer) ----
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "fills", nullable = false, columnDefinition = "jsonb")
  var fillsJson: String = "[]",
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "entries", nullable = false, columnDefinition = "jsonb")
  var entriesJson: String = "[]",
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "exits", nullable = false, columnDefinition = "jsonb")
  var exitsJson: String = "[]",
  @Column(length = 2000) var note: String? = null,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
