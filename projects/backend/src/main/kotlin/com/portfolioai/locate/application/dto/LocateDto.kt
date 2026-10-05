package com.portfolioai.locate.application.dto

import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One locate as exposed to the front — [cost] is shares × price per share, computed here.
 * [stockPrice] is the share's price when it was taken ; the front derives the locate's weight
 * (price per share ÷ share price).
 */
data class LocateDto(
  val id: UUID,
  val tradingDate: LocalDate,
  val ticker: String,
  val shares: Int,
  val pricePerShare: BigDecimal,
  val stockPrice: BigDecimal?,
  val cost: BigDecimal,
  val note: String?,
  val createdAt: Instant,
  val updatedAt: Instant,
)
