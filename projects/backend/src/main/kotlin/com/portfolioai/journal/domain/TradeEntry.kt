package com.portfolioai.journal.domain

import com.portfolioai.auth.domain.User
import com.portfolioai.shared.Pattern
import jakarta.persistence.CascadeType
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.OneToMany
import jakarta.persistence.OrderBy
import jakarta.persistence.Table
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.hibernate.annotations.BatchSize
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

/**
 * One trade in the journal. Multi-tenant via [user] (`@ManyToOne` on the FK, `ON DELETE CASCADE`).
 *
 * Since the model rework (issue #192) a trade is **born from a stat** : [statEntryId] is mandatory,
 * and [tradeDate], [ticker] and [pattern] are copied from that stat at creation — the trade itself
 * only carries what the user types afterwards (executions, post-mortem, screenshot, real P&L). The
 * copy is deliberate denormalization : the listing sorts and filters on those three columns without
 * ever joining `stat_entry`.
 *
 * Categorical fields ([direction], [pattern]) map to Postgres ENUM types via
 * `@JdbcTypeCode(SqlTypes.NAMED_ENUM)` — Hibernate 6 reads the Postgres enum cast directly without
 * going through a STRING converter. Kotlin enum names must match the Postgres enum values exactly.
 *
 * The position is built from an ordered list of [executions] and a [direction]. The flat columns
 * [size], [openPrice], [exitPrice], [profitDollars], [gainPercent] are not user-supplied : they are
 * **derived aggregates** recomputed from the executions by [TradePositionCalculator] on every write
 * (see `TradeEntryService`). They stay as columns so the listing's sort/filter/pagination, the CSV
 * export and the account event keep reading flat values without a join.
 *
 * **P&L** — [profitDollars] is the one computed from the executions ; [realProfitDollars] is the
 * one read off the broker statement, entered by hand to absorb fees and rounding. [retainedProfit]
 * (real if set, else computed) is what reaches the account. It is **derived** — the Kotlin getter
 * is the read path, and the `retained_profit_dollars` column beside it is a Postgres GENERATED
 * column the listing sorts on (#195), recomputed by the DB from the same two fields so the two
 * can't drift.
 */
@Entity
@Table(name = "trade_entry")
class TradeEntry(
  @Id val id: UUID = UUID.randomUUID(),

  /** Owner. Multi-tenant scope key — every read path filters on `user.id`. */
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,

  /** Source stat. Mandatory : there is no way to create a trade out of thin air (#192). */
  @Column(name = "stat_entry_id", nullable = false) var statEntryId: UUID,

  // ---- Identity, copied from the source stat ----
  @Column(name = "trade_date", nullable = false) var tradeDate: LocalDate,
  @Column(nullable = false, length = 20) var ticker: String,
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column(nullable = false) var pattern: Pattern = Pattern.GUS,

  /** Position direction. NULL until the first execution is recorded. */
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column var direction: TradeDirection? = null,

  // ---- Derived aggregates (computed from `executions` by TradePositionCalculator) ----
  @Column var size: Int? = null,
  @Column(name = "open_price", precision = 18, scale = 4) var openPrice: BigDecimal? = null,
  @Column(name = "exit_price", precision = 18, scale = 4) var exitPrice: BigDecimal? = null,
  @Column(name = "profit_dollars", precision = 18, scale = 2) var profitDollars: BigDecimal? = null,
  @Column(name = "gain_percent", precision = 8, scale = 4) var gainPercent: BigDecimal? = null,

  /** P&L read off the broker statement — overrides [profitDollars] when set. */
  @Column(name = "real_profit_dollars", precision = 18, scale = 2)
  var realProfitDollars: BigDecimal? = null,

  /**
   * Postgres GENERATED column : `COALESCE(real_profit_dollars, profit_dollars)`. Mapped read-only
   * so the listing can sort on it server-side ; application code reads [retainedProfit] instead,
   * never this field (it is stale in-session until the row is re-read).
   */
  @Column(
    name = "retained_profit_dollars",
    precision = 18,
    scale = 2,
    insertable = false,
    updatable = false,
  )
  val retainedProfitDollars: BigDecimal? = null,

  // ---- Post-mortem ----
  /** "What happened" — the free-text account of the trade. */
  @Column(length = 2000) var note: String? = null,
  /** "Mistake / to improve" — what to do differently next time. */
  @Column(name = "error_note", length = 2000) var errorNote: String? = null,

  /**
   * Denormalized presence flag for the single optional screenshot (issue #110). Maintained by the
   * service on attach/delete so the DTO exposes it without joining `trade_attachment` — the image
   * bytes never load on the listing.
   */
  @Column(name = "has_screenshot", nullable = false) var hasScreenshot: Boolean = false,

  // ---- Audit ----
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
) {

  /**
   * Source-of-truth executions, ordered by [TradeExecution.seq]. Cascade-all + orphan-removal so
   * the child rows live and die with the parent — [replaceExecutions] rewrites the whole list on
   * update.
   */
  @OneToMany(mappedBy = "tradeEntry", cascade = [CascadeType.ALL], orphanRemoval = true)
  @OrderBy("seq ASC")
  // Batch-load the collections for a page of trades in one IN query instead of N+1 — the listing
  // serializes executions on every row.
  @BatchSize(size = 50)
  var executions: MutableList<TradeExecution> = mutableListOf()

  /**
   * The P&L that counts : the real one when the broker statement has been entered, the computed one
   * otherwise. This is what the account movement is built from — see `TradeChangedEvent`.
   */
  val retainedProfit: BigDecimal?
    get() = realProfitDollars ?: profitDollars

  /**
   * [retainedProfit] as a percentage of the same cost basis [gainPercent] uses. The computed gain %
   * is profit ÷ basis, so the retained one is it scaled by the real / computed ratio — no need to
   * re-derive the basis (which lives in the executions, not on the row).
   *
   * Null when a real P&L was typed on a break-even position : the ratio has no basis to lean on,
   * and a percentage of nothing would be a made-up figure.
   */
  val retainedGainPercent: BigDecimal?
    get() {
      val real = realProfitDollars ?: return gainPercent
      val computed = profitDollars ?: return null
      if (computed.signum() == 0) return null
      // Scale 4, like the `gain_percent` column itself.
      return gainPercent?.multiply(real)?.divide(computed, 4, RoundingMode.HALF_UP)
    }

  /**
   * Rewrites the execution list from the given legs, re-sequencing them 0-based in order.
   *
   * **Reuse in place, don't clear + re-add** : a `clear()` + re-add makes Hibernate INSERT the new
   * `seq` values before it DELETEs the old ones during a full-replace update, which transiently
   * violates the unique `(trade_entry_id, seq)` constraint and blows up with a
   * `DataIntegrityViolationException`. By mutating the surviving rows positionally, each `seq` is
   * only ever held by one row at a time. The surplus tail is removed (orphan-removal deletes it).
   */
  fun replaceExecutions(legs: List<TradePositionCalculator.Leg>) {
    for (i in legs.indices) {
      val leg = legs[i]
      if (i < executions.size) {
        val exec = executions[i]
        exec.seq = i
        exec.kind = leg.kind
        exec.shares = leg.shares
        exec.price = leg.price
        exec.executedAt = leg.executedAt
      } else {
        executions.add(
          TradeExecution(
            tradeEntry = this,
            seq = i,
            kind = leg.kind,
            shares = leg.shares,
            price = leg.price,
            executedAt = leg.executedAt,
          )
        )
      }
    }
    while (executions.size > legs.size) {
      executions.removeAt(executions.size - 1)
    }
  }

  /** Copies the derived aggregates from [TradePositionCalculator] onto the flat columns. */
  fun applyAggregates(aggregates: TradePositionCalculator.Aggregates) {
    size = aggregates.size
    openPrice = aggregates.avgEntry
    exitPrice = aggregates.avgExit
    profitDollars = aggregates.profitDollars
    gainPercent = aggregates.gainPercent
  }
}
