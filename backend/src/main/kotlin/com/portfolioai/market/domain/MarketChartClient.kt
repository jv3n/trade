package com.portfolioai.market.domain

/**
 * Outbound port for the Phase 1 ticker dossier — abstracts whichever upstream provides the OHLC
 * series and meta. Two implementations live in `infrastructure/market/` : `TwelveDataClient` (real
 * HTTP — REST + apikey) and `MockMarketChartClient` (deterministic synthetic data, default in
 * `application.yml`). Selection via `market.provider`.
 *
 * The port returns provider-neutral domain types ([MarketChart] = quote + bars). Each adapter is
 * responsible for whatever raw shape the upstream returns and for the conversion.
 */
interface MarketChartClient {
  fun fetchChart(symbol: String, range: String = "1y", interval: String = "1d"): MarketChart
}
