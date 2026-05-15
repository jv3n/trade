package com.portfolioai.market.domain

/**
 * Raw output of a [com.portfolioai.market.domain.MarketChartClient] : the latest quote and the OHLC
 * time series, both in domain types. No indicators yet — those are computed by
 * [com.portfolioai.market.application.IndicatorCalculator] downstream.
 *
 * Provider-agnostic shape : Twelve Data and the mock provider both converge on this type, so adding
 * another upstream is a localized change in the adapter.
 */
data class MarketChart(val quote: TickerQuote, val bars: List<OhlcBar>)
