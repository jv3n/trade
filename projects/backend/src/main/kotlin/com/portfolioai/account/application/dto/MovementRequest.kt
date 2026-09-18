package com.portfolioai.account.application.dto

import com.portfolioai.account.domain.AccountMovementType
import java.math.BigDecimal
import java.time.LocalDate

/**
 * Body for POST `/api/account/movements` (create) and PUT `/api/account/movements/{id}` (edit).
 *
 * On **create**, [type] must be [AccountMovementType.DEPOSIT] or [AccountMovementType.WITHDRAWAL] —
 * `TRADE` is managed from the journal and `ADJUSTMENT` is created via the correction endpoint (both
 * rejected with 400). On **edit**, [type] must match the existing movement's type.
 *
 * [amount] is a **positive magnitude** for DEPOSIT / WITHDRAWAL (the service applies the sign from
 * the type) ; for an ADJUSTMENT edit it is the **signed** value. [note] is optional, trimmed, blank
 * → null.
 */
data class MovementRequest(
  val type: AccountMovementType,
  val amount: BigDecimal,
  val valueDate: LocalDate,
  val note: String? = null,
)
