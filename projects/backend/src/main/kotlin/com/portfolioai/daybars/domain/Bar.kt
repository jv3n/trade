package com.portfolioai.daybars.domain

import java.math.BigDecimal
import java.time.Instant

/** One 1-min bar, [time] its opening minute. */
data class Bar(
  val time: Instant,
  val open: BigDecimal,
  val high: BigDecimal,
  val low: BigDecimal,
  val close: BigDecimal,
  val volume: Long,
)
