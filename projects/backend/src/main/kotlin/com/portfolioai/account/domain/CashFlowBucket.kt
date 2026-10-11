package com.portfolioai.account.domain

import java.math.BigDecimal
import java.time.LocalDate

/**
 * What one bucket of the cash-flow report moved, per series — every amount signed as on the ledger.
 * Trades are split by sign so the chart can stack winners above the line and losers below. [start]
 * is the bucket's own first day, which can fall before the period's (a week started on the Monday
 * before) ; only the period's movements are counted in it.
 */
data class CashFlowBucket(
  val start: LocalDate,
  val winningTrades: BigDecimal,
  val losingTrades: BigDecimal,
  val locates: BigDecimal,
  val deposits: BigDecimal,
  val withdrawals: BigDecimal,
  val adjustments: BigDecimal,
) {
  val net: BigDecimal
    get() = winningTrades + losingTrades + locates + deposits + withdrawals + adjustments
}
