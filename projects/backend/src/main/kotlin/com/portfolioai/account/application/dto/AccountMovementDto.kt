package com.portfolioai.account.application.dto

import com.portfolioai.account.domain.AccountMovement
import com.portfolioai.account.domain.AccountMovementType
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One movement as exposed to the front. [amount] is signed (deposits +, withdrawals −, trade P&L /
 * adjustments ±). [tradeEntryId] is non-null only for [AccountMovementType.TRADE] rows — the front
 * renders the linked ticker chip + a link to the journal, and the row is read-only.
 */
data class AccountMovementDto(
  val id: UUID,
  val type: AccountMovementType,
  val amount: BigDecimal,
  val valueDate: LocalDate,
  val note: String?,
  val tradeEntryId: UUID?,
  val createdAt: Instant,
  val updatedAt: Instant,
)

fun AccountMovement.toDto(): AccountMovementDto =
  AccountMovementDto(
    id = id,
    type = type,
    amount = amount,
    valueDate = valueDate,
    note = note,
    tradeEntryId = tradeEntryId,
    createdAt = createdAt,
    updatedAt = updatedAt,
  )
