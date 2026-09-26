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

/**
 * A ticker spotted on the radar in the morning, captured with what is known in **premarket** only
 * (cf. `mockup/PARCOURS.md › Étape 1`). Scoped by [user] (`ON DELETE CASCADE`) ; one candidate per
 * (user, [tradingDate], [ticker]) — enforced by `ux_candidate_user_day_ticker`. It has no pattern :
 * the pattern is chosen when promoting, one stat per pattern (#434).
 *
 * Nothing about sizing lives here (capital, risk, stop, ladders) : it isn't known at capture time.
 * The derived figures — gap %, push %, locate / price, target price — are never stored ; the front
 * computes them from [previousClose], [pmOpen], [pmHigh], [locatePerShare], [openPrice] and
 * [targetPushPercent].
 */
@Entity
@Table(name = "candidate")
class Candidate(
  @Id val id: UUID = UUID.randomUUID(),

  /** Owner. Multi-tenant scope key — every read path filters on `user.id`. */
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,

  /** Session the candidate was captured for — the list is browsed day by day. */
  @Column(name = "trading_date", nullable = false) var tradingDate: LocalDate,
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

  // ---- At the open ----
  /** Session open, typed at 9:30 — the base of the target price, carried over to the stat. */
  @Column(name = "open_price", precision = 18, scale = 4) var openPrice: BigDecimal? = null,
  /**
   * Push aimed at for this ticker, in % above the open — null follows the reference picked on the
   * card (median, average… of the completed stats). A plan, so it stays off the stat.
   */
  @Column(name = "target_push_percent", precision = 7, scale = 2)
  var targetPushPercent: BigDecimal? = null,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
