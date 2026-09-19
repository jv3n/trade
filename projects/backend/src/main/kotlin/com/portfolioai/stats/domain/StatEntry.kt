package com.portfolioai.stats.domain

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
 * One stat row — a candidate that made it to the stats sheet, completed after the 4 pm close with
 * how the session went (cf. `mockup/PARCOURS.md`, steps 2 and 5). Scoped by [user] (`ON DELETE
 * CASCADE`) ; one stat per (user, [tradeDate], [ticker]).
 *
 * Two blocks :
 * - **Premarket** ([previousClose] … [note]) — copied from the source candidate when the stat is
 *   created, and kept as-is afterwards. [candidateId] keeps the trace (deleting the candidate later
 *   nulls the link without touching the stat).
 * - **Session** ([openPrice] … [eodPrice]) — entered at the close. All null while the stat is "to
 *   complete" ; [isCompleted] is the status, never a stored column.
 *
 * No percentage is stored : gap, premarket push, push at open, HOD / LOD / EOD are all derived from
 * the prices ([StatMetrics] server-side for the KPIs, `stats.math` on the front).
 */
@Entity
@Table(name = "stat_entry")
class StatEntry(
  @Id val id: UUID = UUID.randomUUID(),

  /** Owner. Multi-tenant scope key — every read path filters on `user.id`. */
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,

  /** The candidate this stat came from — null once that candidate is deleted. */
  @Column(name = "candidate_id") var candidateId: UUID? = null,
  @Column(name = "trade_date", nullable = false) var tradeDate: LocalDate,
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column(nullable = false) var pattern: Pattern = Pattern.GUS,
  @Column(nullable = false, length = 20) var ticker: String,

  // ---- Premarket (copied from the candidate) ----
  @Column(name = "previous_close", nullable = false, precision = 18, scale = 4)
  var previousClose: BigDecimal,
  @Column(name = "pm_open", nullable = false, precision = 18, scale = 4) var pmOpen: BigDecimal,
  @Column(name = "pm_high", nullable = false, precision = 18, scale = 4) var pmHigh: BigDecimal,
  @Column(name = "float_millions", precision = 12, scale = 2) var floatMillions: BigDecimal? = null,
  @Column(name = "volume_millions", precision = 12, scale = 2)
  var volumeMillions: BigDecimal? = null,
  @Column(name = "locate_per_share", precision = 10, scale = 4)
  var locatePerShare: BigDecimal? = null,
  @Column(length = 2000) var note: String? = null,

  // ---- Session (entered at the 4 pm close) ----
  /** Session open — the base of every session percentage. */
  @Column(name = "open_price", precision = 18, scale = 4) var openPrice: BigDecimal? = null,
  /** Price reached by the push that follows the open. */
  @Column(name = "push_open_price", precision = 18, scale = 4)
  var pushOpenPrice: BigDecimal? = null,
  @Column(name = "hod_price", precision = 18, scale = 4) var hodPrice: BigDecimal? = null,
  @Column(name = "lod_price", precision = 18, scale = 4) var lodPrice: BigDecimal? = null,
  @Column(name = "eod_price", precision = 18, scale = 4) var eodPrice: BigDecimal? = null,

  // ---- Flags ----
  @Column(nullable = false) var ssr: Boolean = false,
  @Column(name = "under_1_dollar", nullable = false) var under1Dollar: Boolean = false,
  @Column(name = "entry_after_11am", nullable = false) var entryAfter11am: Boolean = false,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
) {

  /** Completed once the whole session block is in — "to complete" is its negation. */
  val isCompleted: Boolean
    get() =
      openPrice != null &&
        pushOpenPrice != null &&
        hodPrice != null &&
        lodPrice != null &&
        eodPrice != null
}
