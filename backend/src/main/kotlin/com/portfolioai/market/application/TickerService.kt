package com.portfolioai.market.application

import com.portfolioai.market.domain.TickerSnapshot
import com.portfolioai.market.infrastructure.market.MarketChartClient
import com.portfolioai.market.infrastructure.market.toOhlcBars
import com.portfolioai.market.infrastructure.market.toTickerQuote
import org.springframework.stereotype.Service

/**
 * Glue between [MarketChartClient] (raw market data — Yahoo or mock) and [IndicatorCalculator]
 * (derived indicators). Given a symbol, returns a complete [TickerSnapshot] usable by the UI
 * dossier and — later — by the LLM narrative pipeline.
 */
@Service
class TickerService(
  private val chartClient: MarketChartClient,
  private val indicatorCalculator: IndicatorCalculator,
) {
  fun load(symbol: String): TickerSnapshot {
    val result = chartClient.fetchChart(symbol, range = "1y", interval = "1d")
    val bars = result.toOhlcBars()
    return TickerSnapshot(
      quote = result.toTickerQuote(),
      bars = bars,
      indicators = indicatorCalculator.compute(bars),
    )
  }
}
