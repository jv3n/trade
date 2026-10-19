package com.portfolioai.stats.domain

import java.math.BigDecimal

/**
 * A mechanical GUS rule (#205) — short at the open + [entryPercent], stop at the
 * open + [stopPercent], covered at the EOD otherwise. The two stop presets of the position-size
 * calculator, which the reference tracker replays every GUS through.
 */
enum class MechanicalRule(val entryPercent: Int, val stopPercent: Int) {
  TEN_FORTY(10, 40),
  SEVEN_THIRTY_ONE(7, 31);

  /**
   * What the rule would have made on [stat], or null when its HOD never reached the entry. No
   * ordering is assumed : from the open, the price passes the entry before it can reach the stop,
   * so a HOD at the stop is a stop-out after the entry.
   */
  fun replay(stat: StatEntry): RuleTrade? {
    val open = stat.openPrice
    val hod = stat.hodPrice
    val eod = stat.eodPrice
    if (open == null || hod == null || eod == null) return null
    val entry = open.above(entryPercent)
    if (hod < entry) return null
    val stop = open.above(stopPercent)
    val stopped = hod >= stop
    val move = StatMetrics.percentChange(entry, if (stopped) stop else eod) ?: return null
    return RuleTrade(stopped = stopped, profitPercent = move.negate())
  }

  private fun BigDecimal.above(percent: Int): BigDecimal =
    multiply(BigDecimal.ONE.add(BigDecimal(percent).movePointLeft(2)))
}

/**
 * One trade a [MechanicalRule] took : [profitPercent] is the short's result in % of the entry,
 * positive when it gained (StatMetrics' encoding, `16.80` = +16.80 %).
 */
data class RuleTrade(val stopped: Boolean, val profitPercent: BigDecimal) {
  val isWin: Boolean
    get() = profitPercent.signum() > 0
}
