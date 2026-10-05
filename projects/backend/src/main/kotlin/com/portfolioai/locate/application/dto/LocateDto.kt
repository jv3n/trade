package com.portfolioai.locate.application.dto

import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** One locate as exposed to the front — [cost] is shares × price per share, computed here. */
data class LocateDto(
  val id: UUID,
  val tradingDate: LocalDate,
  val ticker: String,
  val shares: Int,
  val pricePerShare: BigDecimal,
  val cost: BigDecimal,
  val note: String?,
  val candidateId: UUID?,
  val createdAt: Instant,
  val updatedAt: Instant,
)
