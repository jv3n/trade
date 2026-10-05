package com.portfolioai.locate.application.dto

import java.math.BigDecimal

/**
 * Body for PUT `/api/locates/{id}` — correcting a typo : the shares, the price, the share's price,
 * the note. The day and the ticker are what the money was for, and do not move.
 */
data class LocateUpdateRequest(
  val shares: Int,
  val pricePerShare: BigDecimal,
  val stockPrice: BigDecimal? = null,
  val note: String? = null,
)
