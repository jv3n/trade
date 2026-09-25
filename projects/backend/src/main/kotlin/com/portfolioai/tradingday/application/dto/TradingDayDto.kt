package com.portfolioai.tradingday.application.dto

import java.time.Instant
import java.time.LocalDate

/** A day's « nothing today » marks — each is the instant it was set, null when not declared. */
data class TradingDayDto(
  val tradingDate: LocalDate,
  val noCandidateAt: Instant?,
  val noTradeAt: Instant?,
)
