package com.portfolioai.candidates.application.dto

import java.math.BigDecimal
import java.time.LocalDate

/**
 * Body for POST `/api/candidates` (create) and PUT `/api/candidates/{id}` (re-save / upsert).
 *
 * [ticker] is trimmed + upper-cased by the service ; [openPrice] and [totalCapital] must be
 * positive and [pctCapitalAtRisk] in `(0, 100]`. The market-context fields ([previousClose],
 * [floatShares], [volume], [morningPush], [borrowCostPerShare]) are entered by hand and optional.
 * [fills] / [entries] / [exits] default to empty. Validation is done in-service (a clean 400, not a
 * DB CHECK hit). Percentages are whole numbers (`5` = 5 %, `40` = 40 %).
 */
data class CandidateRequest(
  val tradingDate: LocalDate,
  val ticker: String,
  val totalCapital: BigDecimal,
  val pctCapitalAtRisk: BigDecimal,
  val openPrice: BigDecimal,
  val stopPct: BigDecimal? = null,
  val previousClose: BigDecimal? = null,
  val floatShares: BigDecimal? = null,
  val volume: BigDecimal? = null,
  val morningPush: BigDecimal? = null,
  val borrowCostPerShare: BigDecimal? = null,
  val fills: List<CandidateFill> = emptyList(),
  val entries: List<CandidateEntry> = emptyList(),
  val exits: List<CandidateExit> = emptyList(),
  val note: String? = null,
)
