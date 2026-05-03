package com.portfolioai.market.application

import com.portfolioai.market.domain.TickerSnapshot
import com.portfolioai.market.infrastructure.market.MarketChartClient
import org.springframework.stereotype.Service

/**
 * Glue between [MarketChartClient] (raw market data — Twelve Data or mock) and
 * [IndicatorCalculator] (derived indicators). Given a symbol, returns a complete [TickerSnapshot]
 * usable by the UI dossier and — later — by the LLM narrative pipeline.
 */
@Service
class TickerService(
  private val chartClient: MarketChartClient,
  private val indicatorCalculator: IndicatorCalculator,
) {
  fun load(symbol: String): TickerSnapshot {
    val chart = chartClient.fetchChart(symbol, range = "1y", interval = "1d")
    return TickerSnapshot(
      quote = chart.quote,
      bars = chart.bars,
      indicators = indicatorCalculator.compute(chart.bars),
    )
  }
}
