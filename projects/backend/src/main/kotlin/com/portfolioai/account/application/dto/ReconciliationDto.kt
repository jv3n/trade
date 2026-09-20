package com.portfolioai.account.application.dto

import com.portfolioai.account.domain.AccountReconciliation
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One morning's reconciliation, as the account page's history line and the Today page's step 1 read
 * it (#198).
 *
 * [gap] is the figure of that morning — zero on a clean one, and then [correctionId] is null. The
 * front shows « 18/09 ✓ » for a clean morning and « 12/09 −12,40 » for a corrected one, so both
 * travel together rather than forcing the caller to infer one from the other.
 */
data class ReconciliationDto(
  val id: UUID,
  val valueDate: LocalDate,
  val brokerBalance: BigDecimal,
  val appBalance: BigDecimal,
  val gap: BigDecimal,
  val correctionId: UUID?,
  val reconciledAt: Instant,
)

fun AccountReconciliation.toDto() =
  ReconciliationDto(
    id = id,
    valueDate = valueDate,
    brokerBalance = brokerBalance,
    appBalance = appBalance,
    gap = gap,
    correctionId = correctionId,
    // The moment the morning was last settled — a re-reconciliation of the same day moves it.
    reconciledAt = updatedAt,
  )

/**
 * Body for `POST /api/account/reconciliations` — the balance TradeZero displays this morning, and
 * the day it belongs to. The service works out the gap itself : letting the client send it would
 * make the stored history depend on the client's own arithmetic.
 */
data class ReconciliationRequest(val brokerBalance: BigDecimal, val valueDate: LocalDate)
