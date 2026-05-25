package com.portfolioai.analyst.application.dto

import com.portfolioai.analyst.domain.AnalystSnapshot
import com.portfolioai.analyst.domain.MonthlyRecommendation
import com.portfolioai.analyst.domain.PriceTarget
import java.math.BigDecimal
import java.time.LocalDate

/** REST representation of [AnalystSnapshot]. Keeps the domain free of Jackson concerns. */
data class AnalystSnapshotDto(
  val symbol: String,
  val asOf: LocalDate,
  val strongBuy: Int,
  val buy: Int,
  val hold: Int,
  val sell: Int,
  val strongSell: Int,
  val totalAnalysts: Int,
  /** `BUY` / `HOLD` / `SELL` / `MIXED` — front maps each to a coloured chip. */
  val consensus: String,
  val priceTarget: PriceTargetDto?,
  /**
   * `true` when the upstream price-target call failed transiently (5xx, network / timeout) — front
   * renders « temporairement indisponible » so the user knows a retry is meaningful. `false`
   * (default) when [priceTarget] is non-null OR the upstream legitimately returned « no target »
   * (200 empty shell or 4xx paid-tier gate). Always `false` when [priceTarget] is non-null.
   */
  val priceTargetUnavailable: Boolean,
  val history: List<MonthlyRecommendationDto>,
)

data class MonthlyRecommendationDto(
  val period: LocalDate,
  val strongBuy: Int,
  val buy: Int,
  val hold: Int,
  val sell: Int,
  val strongSell: Int,
)

data class PriceTargetDto(
  val high: BigDecimal,
  val low: BigDecimal,
  val mean: BigDecimal,
  val median: BigDecimal,
  val numberOfAnalysts: Int,
)

fun AnalystSnapshot.toDto(): AnalystSnapshotDto =
  AnalystSnapshotDto(
    symbol = symbol,
    asOf = asOf,
    strongBuy = strongBuy,
    buy = buy,
    hold = hold,
    sell = sell,
    strongSell = strongSell,
    totalAnalysts = totalAnalysts,
    consensus = consensus.name,
    priceTarget = priceTarget?.toDto(),
    priceTargetUnavailable = priceTargetUnavailable,
    history = history.map { it.toDto() },
  )

private fun MonthlyRecommendation.toDto() =
  MonthlyRecommendationDto(
    period = period,
    strongBuy = strongBuy,
    buy = buy,
    hold = hold,
    sell = sell,
    strongSell = strongSell,
  )

private fun PriceTarget.toDto() =
  PriceTargetDto(
    high = high,
    low = low,
    mean = mean,
    median = median,
    numberOfAnalysts = numberOfAnalysts,
  )
