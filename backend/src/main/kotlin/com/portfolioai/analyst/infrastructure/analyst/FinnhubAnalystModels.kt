package com.portfolioai.analyst.infrastructure.analyst

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

/**
 * Wire shape for Finnhub `/stock/recommendation` — a flat JSON array, each item is a monthly
 * snapshot with the five rating buckets. Reference :
 * https://finnhub.io/docs/api/recommendation-trends
 *
 * Quirks :
 * - `period` is `YYYY-MM-DD` ; we parse it with [java.time.LocalDate.parse] in the mapper.
 * - The array is **newest-first** in practice — we re-sort defensively in the mapper rather than
 *   trusting the documented ordering.
 * - Symbols without coverage return an empty array (HTTP 200) rather than a 404. The mapper layer
 *   converts that to [NoSuchElementException] so the controller surfaces a 404 to the front.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class FinnhubRecommendationItem(
  val symbol: String,
  val period: String,
  val strongBuy: Int,
  val buy: Int,
  val hold: Int,
  val sell: Int,
  val strongSell: Int,
)

/**
 * Wire shape for Finnhub `/stock/price-target`. Reference :
 * https://finnhub.io/docs/api/price-target
 *
 * The endpoint is documented as free tier but returns 401/403 in practice on some accounts /
 * symbols. The adapter swallows those into a `null` price target rather than failing the whole
 * fetch — the recommendation breakdown is still useful on its own.
 *
 * Numeric fields can be `0` when the target is unavailable for a given symbol (Finnhub returns the
 * shell with zeros rather than 404). The mapper treats an all-zero payload as "no target".
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class FinnhubPriceTarget(
  val symbol: String,
  val targetHigh: java.math.BigDecimal,
  val targetLow: java.math.BigDecimal,
  val targetMean: java.math.BigDecimal,
  val targetMedian: java.math.BigDecimal,
  val numberOfAnalysts: Int,
)
