package com.portfolioai.candidates.domain

import com.portfolioai.auth.domain.User
import com.portfolioai.shared.Pattern
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
 * A ticker spotted on the radar in the morning, captured with what is known in **premarket** only
 * (cf. `mockup/PARCOURS.md › Étape 1`). Scoped by [user] (`ON DELETE CASCADE`) ; one candidate per
 * (user, [tradingDate], [ticker]) — enforced by `ux_candidate_user_day_ticker`.
 *
 * Nothing about sizing lives here (capital, risk, stop, ladders) : it isn't known at capture time.
 * The derived figures — gap %, push %, locate / price — are never stored ; the front computes them
 * from [previousClose], [pmOpen], [pmHigh] and [locatePerShare].
 */
@Entity
@Table(name = "candidate")
class Candidate(
  @Id val id: UUID = UUID.randomUUID(),

  /** Owner. Multi-tenant scope key — every read path filters on `user.id`. */
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,

  /** Session the candidate was captured for — the list is browsed day by day. */
  @Column(name = "trading_date", nullable = false) var tradingDate: LocalDate,
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column(nullable = false) var pattern: Pattern = Pattern.GUS,
  @Column(nullable = false, length = 20) var ticker: String,

  // ---- Premarket prices ----
  /** Previous session's close (daily candle). */
  @Column(name = "previous_close", nullable = false, precision = 18, scale = 4)
  var previousClose: BigDecimal,
  /** First premarket print, at 4:00 am. */
  @Column(name = "pm_open", nullable = false, precision = 18, scale = 4) var pmOpen: BigDecimal,
  @Column(name = "pm_high", nullable = false, precision = 18, scale = 4) var pmHigh: BigDecimal,

  // ---- Context (millions of shares, locate in $ / share) ----
  @Column(name = "float_millions", precision = 12, scale = 2) var floatMillions: BigDecimal? = null,
  /** TradeZero volume **at capture time** — a rough read of the interest, not the day's volume. */
  @Column(name = "volume_millions", precision = 12, scale = 2)
  var volumeMillions: BigDecimal? = null,
  /** Cost to borrow one share to short. */
  @Column(name = "locate_per_share", precision = 10, scale = 4)
  var locatePerShare: BigDecimal? = null,
  @Column(length = 2000) var note: String? = null,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
