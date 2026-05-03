package com.portfolioai.market.application

import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.TickerSnapshot
import com.portfolioai.market.domain.Timeframe
import com.portfolioai.market.infrastructure.market.MarketChartClient
import org.springframework.stereotype.Service

/**
 * Glue between [MarketChartClient] (raw market data — Twelve Data or mock) and
 * [IndicatorCalculator] (derived indicators). Given a symbol, returns a complete [TickerSnapshot]
 * usable by the UI dossier and — later — by the LLM narrative pipeline.
 *
 * [load] is the dossier endpoint (always 1Y daily — the reference view that feeds indicators and
 * the narrative). [loadBars] backs the multi-timeframe chart toggle ; it returns the raw bar series
 * only, no indicators, no narrative.
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

  /**
   * Fetches OHLC bars for the chart at the requested [timeframe]. No indicator computation, no
   * quote enrichment — the dossier already serves those at the canonical 1Y view, this method is
   * dedicated to the chart re-fetch when the user clicks a different timeframe button.
   */
  fun loadBars(symbol: String, timeframe: Timeframe): List<OhlcBar> =
    chartClient.fetchChart(symbol, range = timeframe.range, interval = timeframe.interval).bars
}
