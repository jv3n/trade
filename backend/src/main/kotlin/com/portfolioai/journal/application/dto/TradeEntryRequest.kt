package com.portfolioai.journal.application.dto

import com.portfolioai.journal.domain.TradeExitStrategy
import com.portfolioai.journal.domain.TradeOpenSide
import com.portfolioai.journal.domain.TradePattern
import com.portfolioai.journal.domain.TradePlay
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

/**
 * Body for POST `/api/journal/trades` and PUT `/api/journal/trades/{id}`. Same shape used for both
 * create and full replace — the journal is small enough that PATCH-style partial updates aren't
 * worth the divergence.
 *
 * Only [tradeDate] and [ticker] are mandatory (non-nullable Kotlin types). Everything else is
 * optional/nullable, mirroring the Postgres schema after V4. [statEntryId] links the trade to an
 * imported stat row (`stat_entry.id`) ; null leaves the trade orphan.
 */
data class TradeEntryRequest(
  val tradeDate: LocalDate,
  val ticker: String,
  val play: TradePlay? = null,
  val pattern: TradePattern? = null,
  val size: Int? = null,
  val openPrice: BigDecimal? = null,
  val exitPrice: BigDecimal? = null,
  val profitDollars: BigDecimal? = null,
  val gainPercent: BigDecimal? = null,
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
