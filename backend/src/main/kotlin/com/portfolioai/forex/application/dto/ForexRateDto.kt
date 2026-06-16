package com.portfolioai.forex.application.dto

import java.math.BigDecimal
import java.time.LocalDate

/**
 * `GET /api/forex/rate` response — 1 [base] = [rate] [quote], as of [asOf] (the ECB publish date,
 * shown next to the converted balance so the user knows how fresh the figure is).
 */
data class ForexRateDto(
  val base: String,
  val quote: String,
  val rate: BigDecimal,
  val asOf: LocalDate,
)
