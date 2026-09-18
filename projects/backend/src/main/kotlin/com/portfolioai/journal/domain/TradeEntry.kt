package com.portfolioai.journal.domain

import com.portfolioai.auth.domain.User
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
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.hibernate.annotations.BatchSize
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

/**
 * One trade in the journal. Multi-tenant via [user] (`@ManyToOne` on the FK, `ON DELETE CASCADE`).
 *
 * Categorical fields ([play], [pattern], [openSide], [exitStrategy]) map to Postgres ENUM types via
 * `@JdbcTypeCode(SqlTypes.NAMED_ENUM)` — Hibernate 6 reads the Postgres enum cast directly without
 * going through a STRING converter. Kotlin enum names must match the Postgres enum values exactly
 * (cf. V1__init.sql).
 *
 * Only [tradeDate] and [ticker] are mandatory (V4 relaxed [play] / [pattern] / [size] / [openPrice]
 * to nullable so a trade can be jotted down fast and completed later). Exit-side fields
 * ([exitPrice], [profitDollars], [gainPercent]) are nullable while the position is open.
 * Preparation-checklist fields are nullable so a backfilled entry doesn't have to tick every box.
 *
 * [statEntryId] is a nullable link to the matching imported stat row (`stat_entry.id`). NULL = an
 * "orphan" trade with no stat attached yet ; the link is assigned later from the UI.
 *
 * Since the multi-execution model (issue #93), the position is built from an ordered list of
 * [executions] and a [direction]. The flat columns [size], [openPrice], [exitPrice],
 * [profitDollars], [gainPercent] are no longer user-supplied : they are **derived aggregates**
 * recomputed from the executions by [TradePositionCalculator] on every write (see
 * `TradeEntryService`). They stay as columns so the listing's sort/filter/pagination, the CSV
 * export and the account event keep reading flat values without a join.
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

  /** Position direction. NULL until the first execution is recorded (issue #93). */
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column var direction: TradeDirection? = null,

  // ---- Derived aggregates (computed from `executions` by TradePositionCalculator) ----
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column var play: TradePlay? = null,
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column var pattern: TradePattern? = null,
  @Column var size: Int? = null,
  @Column(name = "open_price", precision = 18, scale = 4) var openPrice: BigDecimal? = null,
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

  // ---- Stat link (NULL = orphan trade, no stat attached) ----
  @Column(name = "stat_entry_id") var statEntryId: UUID? = null,

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
   * Rewrites the execution list from the given (kind, shares, price) legs, re-sequencing them
   * 0-based in order.
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
      } else {
        executions.add(
          TradeExecution(
            tradeEntry = this,
            seq = i,
            kind = leg.kind,
            shares = leg.shares,
            price = leg.price,
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
