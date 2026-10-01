package com.portfolioai.journal.application.dto

import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.shared.TradeDirection
import java.math.BigDecimal
import java.util.UUID

/**
 * The little the `stats` context needs to know about a trade : enough to replace the « → Trade »
 * button with a link to it, labelled by the retained P&L (#193) — one per trade, several per stat
 * since #500, each with its own [direction]. Deliberately not the whole [TradeEntryDto] — the stats
 * listing has no business carrying the executions and the post-mortem of every traded row.
 *
 * @param direction Null until the trade's first execution is typed in.
 * @param retainedProfitDollars The P&L that counts (real if typed in, else computed). Null while
 *   the position is open — the link then shows no figure.
 */
data class TradeLinkDto(
  val tradeId: UUID,
  val direction: TradeDirection?,
  val retainedProfitDollars: BigDecimal?,
)

fun TradeEntry.toLinkDto() =
  TradeLinkDto(tradeId = id, direction = direction, retainedProfitDollars = retainedProfit)
