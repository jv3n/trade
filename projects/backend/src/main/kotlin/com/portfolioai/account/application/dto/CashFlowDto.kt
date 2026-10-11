package com.portfolioai.account.application.dto

import com.portfolioai.account.domain.CashFlowBucket
import java.math.BigDecimal
import java.time.LocalDate

/**
 * The account's cash flow over a period, bucket by bucket (#685). Every bucket of the period is
 * present — one with no movement at zero, so the timeline never collapses.
 *
 * [openingBalance] is the balance before the period's first day and [closingBalance] the one at the
 * end of its last : the whole account, whatever the type filter, since a balance filtered to trades
 * would be no balance at all.
 */
data class CashFlowDto(
  val dateFrom: LocalDate?,
  val dateTo: LocalDate?,
  val openingBalance: BigDecimal,
  val closingBalance: BigDecimal,
  val buckets: List<CashFlowBucketDto>,
)

/**
 * One bar. [from] and [to] are the days it covers **within the period** — the first and last
 * buckets are clipped to it, so a week cut by the period reads « 18/06 → 21/06 », not the whole
 * week.
 */
data class CashFlowBucketDto(
  val from: LocalDate,
  val to: LocalDate,
  val winningTrades: BigDecimal,
  val losingTrades: BigDecimal,
  val locates: BigDecimal,
  val deposits: BigDecimal,
  val withdrawals: BigDecimal,
  val adjustments: BigDecimal,
  val net: BigDecimal,
)

fun CashFlowBucket.toDto(from: LocalDate, to: LocalDate) =
  CashFlowBucketDto(
    from = from,
    to = to,
    winningTrades = winningTrades,
    losingTrades = losingTrades,
    locates = locates,
    deposits = deposits,
    withdrawals = withdrawals,
    adjustments = adjustments,
    net = net,
  )
