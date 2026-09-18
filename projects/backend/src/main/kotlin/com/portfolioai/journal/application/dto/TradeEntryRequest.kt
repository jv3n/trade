package com.portfolioai.journal.application.dto

import com.portfolioai.journal.domain.TradeDirection
import com.portfolioai.journal.domain.TradeExitStrategy
import com.portfolioai.journal.domain.TradeOpenSide
import com.portfolioai.journal.domain.TradePattern
import com.portfolioai.journal.domain.TradePlay
import java.time.LocalDate
import java.util.UUID

/**
 * Body for POST `/api/journal/trades` and PUT `/api/journal/trades/{id}`. Same shape used for both
 * create and full replace — the journal is small enough that PATCH-style partial updates aren't
 * worth the divergence.
 *
 * Only [tradeDate] and [ticker] are mandatory. Since the multi-execution model (issue #93) the
 * execution data is carried by [direction] + [executions] (an ordered list of entry/exit legs). The
 * flat aggregates (size, avg prices, P&L, gain%) are **derived** server-side by
 * `TradePositionCalculator` — the client never sends them. An empty [executions] list is valid (a
 * trade jotted down before any fill) ; [direction] may then stay null.
 */
data class TradeEntryRequest(
  val tradeDate: LocalDate,
  val ticker: String,
  val direction: TradeDirection? = null,
  val executions: List<ExecutionRequest> = emptyList(),
  val play: TradePlay? = null,
  val pattern: TradePattern? = null,
  val note: String? = null,
  val pre935To10h: Boolean? = null,
  val preGapUp50: Boolean? = null,
  val prePrice1To10: Boolean? = null,
  val preFloat3To50m: Boolean? = null,
  val preWaitPush: Boolean? = null,
  val openSide: TradeOpenSide? = null,
  val shortOnResistance: Boolean? = null,
  val exitStrategy: TradeExitStrategy? = null,
  val errorNote: String? = null,
  val statEntryId: UUID? = null,
)
