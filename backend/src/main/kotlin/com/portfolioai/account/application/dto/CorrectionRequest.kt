package com.portfolioai.account.application.dto

import java.math.BigDecimal
import java.time.LocalDate

/**
 * Body for POST `/api/account/corrections`. The user enters the **real** balance read from the
 * broker ; the service records an `ADJUSTMENT` movement of `targetBalance − currentBalance` so the
 * derived balance matches reality while keeping an auditable trace of *why* it moved (broker fees,
 * financing, slippage not captured by deposits / withdrawals / trades). A zero delta (target
 * already matches) is rejected with 400 — nothing to record.
 */
data class CorrectionRequest(
  val targetBalance: BigDecimal,
  val valueDate: LocalDate,
  val note: String? = null,
)
