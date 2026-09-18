package com.portfolioai.journal.application

import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

/**
 * Published by [TradeEntryService] after a trade is created, updated or deleted (on create / update
 * the trade is `saveAndFlush`ed first), so the `account` context can sync the matching read-only
 * `TRADE` movement (realized P&L → balance). Consumed **synchronously, in the same transaction** by
 * the account module's `@EventListener` — trade + movement commit or roll back together. The
 * pre-publish flush guarantees the trade row exists in the transaction before the movement's FK
 * (`account_movement.trade_entry_id`) is written.
 *
 * On **deletion** the event carries [profitDollars] = null : the consumer removes the linked
 * movement and re-floats the latest balance correction (the delete moves the balance). It fires
 * before the trade row is deleted, so the DB `ON DELETE CASCADE` on
 * `account_movement.trade_entry_id` is only a safety net.
 *
 * [profitDollars] null (or zero) means "no realized P&L" → the consumer removes any existing TRADE
 * movement (an open, break-even, reopened or deleted trade has no balance impact).
 */
data class TradeChangedEvent(
  val tradeId: UUID,
  val userId: UUID,
  val ticker: String,
  val tradeDate: LocalDate,
  val profitDollars: BigDecimal?,
)
