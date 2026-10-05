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
 *
 * [locateId] / [locateTicker] / [locateShares] are set only on [AccountMovementType.LOCATE] rows,
 * read-only like a trade's : the label "SGBX 2000".
 *
 * [measuredGap] is set only on a morning's correction : the gap that morning recorded. An [amount]
 * that differs from it means a later fix to an earlier row was absorbed there (#476, #477). Only
 * the listing fills it : the add / edit / bare-correction responses can never be a morning's
 * correction, because #476 refuses editing one and a morning writes its own through the reconciler.
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
  val locateId: UUID?,
  val locateTicker: String?,
  val locateShares: Int?,
  val measuredGap: BigDecimal?,
  val createdAt: Instant,
  val updatedAt: Instant,
)

fun AccountMovement.toDto(
  balanceAfter: BigDecimal,
  measuredGap: BigDecimal? = null,
): AccountMovementDto =
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
    locateId = locateId,
    locateTicker = locateTicker,
    locateShares = locateShares,
    measuredGap = measuredGap,
    createdAt = createdAt,
    updatedAt = updatedAt,
  )
