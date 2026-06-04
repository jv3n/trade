package com.portfolioai.journal.application.dto

import com.portfolioai.journal.domain.TradeExitStrategy
import com.portfolioai.journal.domain.TradeOpenSide
import com.portfolioai.journal.domain.TradePattern
import com.portfolioai.journal.domain.TradePlay
import java.math.BigDecimal
import java.time.LocalDate

/**
 * Body for POST `/api/journal/trades` and PUT `/api/journal/trades/{id}`. Same shape used for both
 * create and full replace — the journal is small enough that PATCH-style partial updates aren't
 * worth the divergence.
 *
 * Required fields are non-nullable Kotlin types ; optional ones (exit data, preparation checklist)
 * are nullable. The Postgres schema mirrors this via `NOT NULL` / nullable declarations and check
 * constraints (size > 0, open_price > 0).
 */
data class TradeEntryRequest(
  val tradeDate: LocalDate,
  val ticker: String,
  val play: TradePlay,
  val pattern: TradePattern,
  val size: Int,
  val openPrice: BigDecimal,
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
)
