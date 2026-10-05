package com.portfolioai.locate.application.dto

import java.math.BigDecimal

/**
 * Body for PUT `/api/locates/{id}` — correcting a typo : the shares, the price, the note. The day,
 * the ticker and the candidate are what the money was for, and do not move.
 */
data class LocateUpdateRequest(
  val shares: Int,
  val pricePerShare: BigDecimal,
  val note: String? = null,
)
