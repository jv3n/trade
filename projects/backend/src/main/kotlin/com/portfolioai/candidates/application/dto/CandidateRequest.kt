package com.portfolioai.candidates.application.dto

import java.math.BigDecimal
import java.time.LocalDate

/**
 * Body for POST `/api/candidates` (create) and PUT `/api/candidates/{id}` (update).
 *
 * [ticker] is trimmed + upper-cased by the service. The three premarket prices are required and
 * positive, with [pmHigh] ≥ [pmOpen] ; [floatMillions], [volumeMillions] and [locatePerShare] are
 * optional and non-negative. The « À l'open » pair is optional too : [openPrice] positive,
 * [targetPushPercent] between 0 and 1000 (null = follows the card's reference). No pattern : it is
 * chosen when promoting (#434). Validation is done in-service (a clean 400, not a DB CHECK hit).
 */
data class CandidateRequest(
  val tradingDate: LocalDate,
  val ticker: String,
  val previousClose: BigDecimal,
  val pmOpen: BigDecimal,
  val pmHigh: BigDecimal,
  val floatMillions: BigDecimal? = null,
  val volumeMillions: BigDecimal? = null,
  val locatePerShare: BigDecimal? = null,
  val note: String? = null,
  val openPrice: BigDecimal? = null,
  val targetPushPercent: BigDecimal? = null,
)
