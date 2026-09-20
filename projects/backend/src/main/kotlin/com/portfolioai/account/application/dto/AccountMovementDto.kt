package com.portfolioai.account.application.dto

import com.portfolioai.account.domain.AccountMovement
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.shared.TradeDirection
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One movement as exposed to the front. [amount] is signed (deposits +, withdrawals −, trade P&L /
 * adjustments ±). [tradeEntryId] is non-null only for [AccountMovementType.TRADE] rows — the front
 * renders the linked ticker chip + a link to the journal, and the row is read-only.
 *
 * [balanceAfter] is the account balance **after** this movement, always computed over the whole
 * ordered history — never over the filtered page. Filtering down to trades must not renumber the
 * column (#229).
 *
 * [tradeDirection] / [tradeSize] complete the TRADE label ("KTTA short 350"). Structured, not
 * pre-formatted : the direction word is translated by the front.
 */
data class AccountMovementDto(
  val id: UUID,
  val type: AccountMovementType,
  val amount: BigDecimal,
  val valueDate: LocalDate,
  val note: String?,
  val balanceAfter: BigDecimal,
  val tradeEntryId: UUID?,
  val tradeDirection: TradeDirection?,
  val tradeSize: Int?,
  val createdAt: Instant,
  val updatedAt: Instant,
)

fun AccountMovement.toDto(balanceAfter: BigDecimal): AccountMovementDto =
  AccountMovementDto(
    id = id,
    type = type,
    amount = amount,
    valueDate = valueDate,
    note = note,
    balanceAfter = balanceAfter,
    tradeEntryId = tradeEntryId,
    tradeDirection = tradeDirection,
    tradeSize = tradeSize,
    createdAt = createdAt,
    updatedAt = updatedAt,
  )
