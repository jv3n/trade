package com.portfolioai.journal.application.dto

import com.portfolioai.journal.domain.TradeDirection
import com.portfolioai.shared.Pattern
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

/**
 * Body for POST `/api/journal/trades` and PUT `/api/journal/trades/{id}`. Same shape used for both
 * create and full replace — the journal is small enough that PATCH-style partial updates aren't
 * worth the divergence.
 *
 * [statEntryId], [tradeDate], [ticker] and [pattern] describe the source stat the trade was created
 * from (#192) : the caller copies them off the stat, the journal stores them as-is and never lets
 * the user retype them. The execution data is carried by [direction] + [executions] (an ordered
 * list of entry/exit legs) ; the flat aggregates (size, avg prices, computed P&L, gain%) are
 * **derived** server-side by `TradePositionCalculator` — the client never sends them. An empty
 * [executions] list is valid (a trade opened before any fill is recorded) ; [direction] may then
 * stay null.
 *
 * [realProfitDollars] is the only P&L the client may send : the figure read off the broker
 * statement, which overrides the computed one.
 */
data class TradeEntryRequest(
  val statEntryId: UUID,
  val tradeDate: LocalDate,
  val ticker: String,
  val pattern: Pattern? = null,
  val direction: TradeDirection? = null,
  val executions: List<ExecutionRequest> = emptyList(),
  val realProfitDollars: BigDecimal? = null,
  val note: String? = null,
  val errorNote: String? = null,
)
