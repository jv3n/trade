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
import java.time.LocalTime
import java.util.UUID
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

/**
 * One stat row — a candidate that made it to the stats sheet, filled with how the session went as
 * the day goes (cf. `mockup/PARCOURS.md`, steps 2 and 5). Scoped by [user] (`ON DELETE CASCADE`) ;
 * one stat per (user, [tradeDate], [ticker], [pattern]) — a candidate can give a GUS and a DT
 * (#434).
 *
 * Two blocks :
 * - **Premarket** ([previousClose] … [note]) — copied from the source candidate when the stat is
 *   created, and kept as-is afterwards. A DT keeps float, volume and note only (#649) : it is read
 *   off the session, so its three premarket prices stay null. [candidateId] keeps the trace
 *   (deleting the candidate later nulls the link without touching the stat).
 * - **Session** — typed field by field during the day, any subset may be in. A GUS (and the
 *   patterns measured like it) fills [openPrice] … [eodPrice], the push's time and optionally its
 *   drop ([gusDropPrice], #713) ; a DT fills its four prices instead, [dtStartPrice] …
 *   [dtRetestPrice] (#428), each with its time (#469), and optionally the drop that follows
 *   ([dtDropPrice], #706). [completedAt] is the status : set when the owner ticks the stat, which
 *   needs the whole session of its pattern ([hasFullSession]) — the `ck_stat_entry_completed_whole`
 *   CHECK backs it up. A [noPush] stat has no push price, and is whole with the four others (#302).
 *
 * A stat is typed or promoted by hand, or dropped by the scanner (#760) and then waits for its
 * [review] ; only [counts] puts it in the figures.
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
  @Column(name = "previous_close", precision = 18, scale = 4) var previousClose: BigDecimal? = null,
  @Column(name = "pm_open", precision = 18, scale = 4) var pmOpen: BigDecimal? = null,
  @Column(name = "pm_high", precision = 18, scale = 4) var pmHigh: BigDecimal? = null,
  @Column(name = "float_millions", precision = 12, scale = 2) var floatMillions: BigDecimal? = null,
  @Column(name = "volume_millions", precision = 12, scale = 2)
  var volumeMillions: BigDecimal? = null,
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
  /** When the push at the open topped (#713), on [tradeDate] — none on a [noPush] day. */
  @Column(name = "push_open_time") var pushOpenTime: LocalTime? = null,
  /**
   * The drop (#713) : the lowest print after the push — after the open on a [noPush] day — before
   * the close, and its time. What the GUS paid ; optional, out of [hasFullSession].
   */
  @Column(name = "gus_drop_price", precision = 18, scale = 4) var gusDropPrice: BigDecimal? = null,
  @Column(name = "gus_drop_time") var gusDropTime: LocalTime? = null,

  // ---- Double top (DT only — `ck_stat_entry_dt_prices_on_dt`) ----
  /** Where the push starts — the open by default, a later low when the push starts from there. */
  @Column(name = "dt_start_price", precision = 18, scale = 4) var dtStartPrice: BigDecimal? = null,
  @Column(name = "dt_top_price", precision = 18, scale = 4) var dtTopPrice: BigDecimal? = null,
  @Column(name = "dt_low_price", precision = 18, scale = 4) var dtLowPrice: BigDecimal? = null,
  @Column(name = "dt_retest_price", precision = 18, scale = 4)
  var dtRetestPrice: BigDecimal? = null,
  /**
   * When each of the four prices printed (#469), wall-clock on [tradeDate], to the minute — in
   * order, start to retest. The legs' durations and the DT median come from them.
   */
  @Column(name = "dt_start_time") var dtStartTime: LocalTime? = null,
  @Column(name = "dt_top_time") var dtTopTime: LocalTime? = null,
  @Column(name = "dt_low_time") var dtLowTime: LocalTime? = null,
  @Column(name = "dt_retest_time") var dtRetestTime: LocalTime? = null,
  /**
   * The lowest print after the retest, before the close, and its time (#706) — what the pattern
   * paid. Required to tick from [DT_DROP_SINCE] on (#710, #726), and empty when the retest took the
   * top and the stock kept going.
   */
  @Column(name = "dt_drop_price", precision = 18, scale = 4) var dtDropPrice: BigDecimal? = null,
  @Column(name = "dt_drop_time") var dtDropTime: LocalTime? = null,

  // ---- Flags ----
  @Column(nullable = false) var ssr: Boolean = false,
  /** The stock never pushed after the open (#302) — [pushOpenPrice] stays empty. */
  @Column(name = "no_push", nullable = false) var noPush: Boolean = false,
  /**
   * The Sink was not read and will not be (#729) — the observer's doing, never the market's : it is
   * never counted beside [noPush]. Its Sink stays empty, and a double top ticks without it.
   */
  @Column(name = "drop_not_read", nullable = false) var dropNotRead: Boolean = false,
  /** More than 20 % of the float held by institutions (#369) — the threshold lives in the UI. */
  @Column(name = "high_institutions", nullable = false) var highInstitutions: Boolean = false,

  /** When the owner ticked the stat as completed — null = to complete. */
  @Column(name = "completed_at") var completedAt: Instant? = null,

  // ---- Source and review (#762) ----
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(nullable = false)
  val source: StatSource = StatSource.MANUAL,
  /** Null on a manual stat — `ck_stat_entry_review_on_scanner`. */
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) var review: StatReview? = null,
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "rejection_reason")
  var rejectionReason: StatRejectionReason? = null,
  @Column(name = "rejection_note") var rejectionNote: String? = null,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
) {

  /** Ticked by its owner — "to complete" is its negation. */
  val isCompleted: Boolean
    get() = completedAt != null

  /**
   * In the figures — a manual stat, or a scanner one once validated (#762). A stat to review or
   * rejected is in no KPI, average, median nor rule score.
   */
  val counts: Boolean
    get() = review == null || review == StatReview.VALIDATED

  val isDoubleTop: Boolean
    get() = pattern == Pattern.DT

  /**
   * The session prices of its pattern are in — five for a GUS, or four on a [noPush] day ; for a DT
   * its five points and their times, four when the retest took the top (#710), before the drop was
   * asked (#726) or when it is not read (#729). The precondition to tick.
   */
  val hasFullSession: Boolean
    get() = missingSessionPrices.isEmpty()

  /**
   * The open under a dollar, where the margin floor bites (#499) — derived from the price, no
   * longer a box restating it. A double top reads its start, which is the open unless moved.
   */
  val under1Dollar: Boolean
    get() = (openPrice ?: dtStartPrice)?.let { it < ONE_DOLLAR } ?: false

  /**
   * Why the recorded prices say this was not the setup (#499) — empty when nothing does. Computed,
   * never ticked ; a flagged stat still counts in every KPI : the failures are the denominator.
   */
  val outOfPattern: List<OutOfPatternReason>
    get() = buildList {
      if (retestTookTop) add(OutOfPatternReason.RETEST_TOOK_TOP)
      val open = openPrice
      if (
        pattern == Pattern.GUS &&
          open != null &&
          (open < OutOfPatternReason.GUS_MIN_PRICE || open > OutOfPatternReason.GUS_MAX_PRICE)
      ) {
        add(OutOfPatternReason.PRICE_OUT_OF_RANGE)
      }
    }

  /** A DT whose retest took the top back : a breakout, with no drop to measure after it. */
  val retestTookTop: Boolean
    get() {
      val top = dtTopPrice
      val retest = dtRetestPrice
      return isDoubleTop && top != null && retest != null && retest >= top
    }

  /**
   * A DT under its top with no drop and no mark : before [DT_DROP_SINCE], the app did not ask for
   * one (#726) — the drop KPIs count it apart, so their `n` still adds up to the completed DTs.
   */
  val isDoubleTopDropNotAsked: Boolean
    get() = isDoubleTop && !retestTookTop && !dropNotRead && dtDropPrice == null

  /** Whether the Sink can be marked as not read : a GUS, or a DT whose Sink is asked (#729). */
  val dropCanBeNotRead: Boolean
    get() = !isDoubleTop || (!retestTookTop && !tradeDate.isBefore(DT_DROP_SINCE))

  /**
   * Labels of the session prices (and a DT's times) still missing, in the sheet's order — a field
   * is only asked of the stats recorded since it existed ([REQUIRED_SINCE], #726).
   */
  val missingSessionPrices: List<String>
    get() =
      (if (isDoubleTop) {
          val drop = !retestTookTop && !dropNotRead
          listOfNotNull(
            "Start" to dtStartPrice,
            "Top" to dtTopPrice,
            "Rejection low" to dtLowPrice,
            "Retest" to dtRetestPrice,
            ("Drop low" to dtDropPrice).takeIf { drop },
            "Start time" to dtStartTime,
            "Top time" to dtTopTime,
            "Rejection low time" to dtLowTime,
            "Retest time" to dtRetestTime,
            ("Drop low time" to dtDropTime).takeIf { drop },
          )
        } else {
          listOfNotNull(
            "Open" to openPrice,
            ("Push at open" to pushOpenPrice).takeUnless { noPush },
            "HOD" to hodPrice,
            "LOD" to lodPrice,
            "EOD" to eodPrice,
          )
        })
        .filter { (label, price) -> price == null && isAsked(label) }
        .map { (label, _) -> label }

  private fun isAsked(label: String): Boolean =
    REQUIRED_SINCE[label]?.let { !tradeDate.isBefore(it) } ?: true

  companion object {
    private val ONE_DOLLAR: BigDecimal = BigDecimal.ONE

    /** The first day the double top's drop was recorded — V26 holds the same date. */
    val DT_DROP_SINCE: LocalDate = LocalDate.of(2026, 10, 12)

    /**
     * Session fields added after the history began, with the day they are asked from : the stats of
     * an earlier day are complete without them, by the standard of the day they were written.
     */
    private val REQUIRED_SINCE: Map<String, LocalDate> =
      mapOf("Drop low" to DT_DROP_SINCE, "Drop low time" to DT_DROP_SINCE)
  }
}
