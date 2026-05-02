package com.portfolioai.market.infrastructure.market

/**
 * Outbound port for the Phase 1 ticker dossier — abstracts whichever upstream provides the OHLC
 * series and meta. Two implementations live in this package : [YahooClient] (real HTTP, default)
 * and [MockMarketChartClient] (deterministic synthetic data, opt-in via `yahoo.provider: mock`).
 *
 * The return type is still [YahooChartResult] because [YahooMappers] already converts from this
 * shape to the domain types — keeping the boundary on Yahoo's payload shape avoids a second mapping
 * layer for what is, in practice, a single upstream. If a non-Yahoo provider is added later (Twelve
 * Data, Finnhub…), a domain-typed port becomes worth the refactor.
 */
interface MarketChartClient {
  fun fetchChart(symbol: String, range: String = "1y", interval: String = "1d"): YahooChartResult
}
