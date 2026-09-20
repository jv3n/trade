package com.portfolioai.journal.domain

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.LocalTime

/**
 * Pure, side-effect-free derivation of a position's aggregates from its raw executions. This is the
 * single source of truth for the journal's auto-computed numbers — the service writes the result
 * onto `trade_entry` on every create/update, the frontend mirrors the same formula for a live
 * preview, and both the account event (retained P&L) and the listing table read the persisted
 * aggregates.
 *
 * **Sign convention** — realized P&L is computed on the *exited* shares only:
 * - `BUY` : profit = (avgExit − avgEntry) × exitedShares (you bought low, sold high → gain).
 * - `SHORT`: profit = (avgEntry − avgExit) × exitedShares (you sold high, covered low → gain).
 *
 * Encoded as `sign × (avgExit − avgEntry) × exitedShares` with `sign = +1` for BUY, `−1` for SHORT.
 *
 * **Scales** mirror the `trade_entry` columns : average prices `4`, profit `2`, gain% `4`.
 *
 * Throws [IllegalArgumentException] (→ HTTP 400 via `GlobalExceptionHandler`) on an inconsistent
 * set of executions (exit without entry, more shares exited than entered, missing direction).
 */
object TradePositionCalculator {

  private const val PRICE_SCALE = 4
  private const val PROFIT_SCALE = 2
  private const val GAIN_SCALE = 4
  private val HUNDRED = BigDecimal("100")

  /**
   * Minimal execution shape the calculator needs — decoupled from the JPA entity for easy testing.
   * [executedAt] is the fill time when known ; it only feeds [Aggregates.durationMinutes].
   */
  data class Leg(
    val kind: ExecutionKind,
    val shares: Int,
    val price: BigDecimal,
    val executedAt: LocalTime? = null,
  )

  /**
   * Fill state of the position, finer-grained than the listing's `exit_price IS NULL` predicate.
   */
  enum class PositionStatus {
    /** No exit executions yet — fully open. */
    OPEN,
    /** Some but not all entered shares have been exited. */
    PARTIAL,
    /** Every entered share has been exited — the position is flat. */
    CLOSED,
  }

  /**
   * Derived snapshot persisted onto `trade_entry` and surfaced in the detail view.
   * [durationMinutes] is the only one that isn't persisted : it is recomputed for the detail view
   * from the execution times, and is null as soon as one of the two ends has no time.
   */
  data class Aggregates(
    val size: Int?,
    val avgEntry: BigDecimal?,
    val avgExit: BigDecimal?,
    val profitDollars: BigDecimal?,
    val gainPercent: BigDecimal?,
    val status: PositionStatus,
    val durationMinutes: Long? = null,
  ) {
    companion object {
      /** A position with no executions yet — every aggregate is unknown, status OPEN. */
      val EMPTY = Aggregates(null, null, null, null, null, PositionStatus.OPEN)
    }
  }

  fun compute(direction: TradeDirection?, legs: List<Leg>): Aggregates {
    if (legs.isEmpty()) return Aggregates.EMPTY
    requireNotNull(direction) { "A position with executions must have a direction (BUY or SHORT)" }

    val entries = legs.filter { it.kind == ExecutionKind.ENTRY }
    val exits = legs.filter { it.kind == ExecutionKind.EXIT }
    require(entries.isNotEmpty()) { "A position must have at least one ENTRY execution" }

    val entryShares = entries.sumOf { it.shares }
    val exitShares = exits.sumOf { it.shares }
    require(exitShares <= entryShares) {
      "Exited shares ($exitShares) cannot exceed entered shares ($entryShares)"
    }

    val avgEntry = weightedAverage(entries)
    if (exitShares == 0) {
      return Aggregates(
        size = entryShares,
        avgEntry = avgEntry,
        avgExit = null,
        profitDollars = null,
        gainPercent = null,
        status = PositionStatus.OPEN,
      )
    }

    val avgExit = weightedAverage(exits)
    val sign = if (direction == TradeDirection.BUY) BigDecimal.ONE else BigDecimal.ONE.negate()
    val exitSharesBd = exitShares.toBigDecimal()
    val profit =
      sign
        .multiply(avgExit.subtract(avgEntry))
        .multiply(exitSharesBd)
        .setScale(PROFIT_SCALE, RoundingMode.HALF_UP)
    val costBasis = avgEntry.multiply(exitSharesBd)
    val gainPercent =
      profit
        .divide(costBasis, GAIN_SCALE + 4, RoundingMode.HALF_UP)
        .multiply(HUNDRED)
        .setScale(GAIN_SCALE, RoundingMode.HALF_UP)

    return Aggregates(
      size = entryShares,
      avgEntry = avgEntry,
      avgExit = avgExit,
      profitDollars = profit,
      gainPercent = gainPercent,
      status = if (exitShares == entryShares) PositionStatus.CLOSED else PositionStatus.PARTIAL,
      durationMinutes = duration(legs),
    )
  }

  /**
   * Time held, from the **first** entry fill to the **last** exit fill, in whole minutes. Null as
   * soon as one of the two ends has no [Leg.executedAt] — a partially timed position has no
   * meaningful duration. Both fills belong to the same session day, so comparing wall-clock times
   * is enough ; a negative span (fills entered out of order) also yields null rather than a
   * nonsense negative duration.
   */
  fun duration(legs: List<Leg>): Long? {
    val start =
      legs.filter { it.kind == ExecutionKind.ENTRY }.mapNotNull { it.executedAt }.minOrNull()
        ?: return null
    val end =
      legs.filter { it.kind == ExecutionKind.EXIT }.mapNotNull { it.executedAt }.maxOrNull()
        ?: return null
    return Duration.between(start, end).toMinutes().takeIf { it >= 0 }
  }

  /**
   * Σ(shares × price) / Σ(shares), rounded to the price scale. Caller guarantees a non-empty list.
   */
  private fun weightedAverage(legs: List<Leg>): BigDecimal {
    val totalShares = legs.sumOf { it.shares }.toBigDecimal()
    val notional =
      legs.fold(BigDecimal.ZERO) { acc, l -> acc.add(l.price.multiply(l.shares.toBigDecimal())) }
    return notional.divide(totalShares, PRICE_SCALE, RoundingMode.HALF_UP)
  }
}
