package com.portfolioai.locate.application.dto

import java.math.BigDecimal
import java.time.LocalDate

/**
 * Body for POST `/api/locates` — a locate is a cost on a (day, ticker), whichever page it is typed
 * from (#625). [shares] above zero, [pricePerShare] zero or more ; [stockPrice], the share's price
 * when the locate was taken, is optional and positive — the front weighs the locate against it.
 */
data class LocateRequest(
  val tradingDate: LocalDate,
  val ticker: String,
  val shares: Int,
  val pricePerShare: BigDecimal,
  val stockPrice: BigDecimal? = null,
  val note: String? = null,
)
