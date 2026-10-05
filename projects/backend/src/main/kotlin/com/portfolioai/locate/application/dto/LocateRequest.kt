package com.portfolioai.locate.application.dto

import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

/**
 * Body for POST `/api/locates`. Taken on a candidate ([candidateId]) : the day and the ticker are
 * the candidate's, and [pricePerShare] defaults to its locate quote. With no candidate,
 * [tradingDate], [ticker] and [pricePerShare] are required. [shares] is always required and
 * positive.
 */
data class LocateRequest(
  val shares: Int,
  val pricePerShare: BigDecimal? = null,
  val candidateId: UUID? = null,
  val tradingDate: LocalDate? = null,
  val ticker: String? = null,
  val note: String? = null,
)
