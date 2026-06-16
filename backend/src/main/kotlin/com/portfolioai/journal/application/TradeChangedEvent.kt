package com.portfolioai.journal.application

import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

/**
 * Published by [TradeEntryService] after a trade is created or updated (the trade is
 * `saveAndFlush`ed first), so the `account` context can sync the matching read-only `TRADE`
 * movement (realized P&L → balance). Consumed **synchronously, in the same transaction** by the
 * account module's `@EventListener` — trade + movement commit or roll back together. The
 * pre-publish flush guarantees the trade row exists in the transaction before the movement's FK
 * (`account_movement.trade_entry_id`) is written.
 *
 * Trade **deletion** is intentionally NOT an event : the DB `ON DELETE CASCADE` on
 * `account_movement.trade_entry_id` removes the movement when the trade row is deleted.
 *
 * [profitDollars] null (or zero) means "no realized P&L" → the consumer removes any existing TRADE
 * movement (an open, break-even, or reopened trade has no balance impact).
 */
data class TradeChangedEvent(
  val tradeId: UUID,
  val userId: UUID,
  val ticker: String,
  val tradeDate: LocalDate,
  val profitDollars: BigDecimal?,
)
