package com.portfolioai.market.application.dto

import com.portfolioai.market.domain.Indicators
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.SectorBenchmark
import com.portfolioai.market.domain.TickerQuote
import com.portfolioai.market.domain.TickerSnapshot
import java.math.BigDecimal
import java.time.Instant

data class TickerQuoteDto(
  val symbol: String,
  val name: String?,
  val currency: String?,
  val exchange: String?,
  val price: BigDecimal,
  val fiftyTwoWeekHigh: BigDecimal?,
  val fiftyTwoWeekLow: BigDecimal?,
  val asOf: Instant,
)

data class IndicatorsDto(
  val asOf: Instant,
  val price: BigDecimal,
  val rsi14: BigDecimal?,
  val ma50: BigDecimal?,
  val ma200: BigDecimal?,
  val momentum30d: BigDecimal?,
  val momentum90d: BigDecimal?,
  val perf1m: BigDecimal?,
  val perf3m: BigDecimal?,
  val perf1y: BigDecimal?,
  val drawdownFrom52wHigh: BigDecimal?,
  val volumeRelative30d: BigDecimal?,
  val distanceToMa50Pct: BigDecimal?,
  val distanceToMa200Pct: BigDecimal?,
)

/** Compact OHLC bar for the chart frontend. Volume optional. */
data class OhlcBarDto(
  val timestamp: Instant,
  val open: BigDecimal,
  val high: BigDecimal,
  val low: BigDecimal,
  val close: BigDecimal,
  val volume: Long,
)

data class TickerSnapshotDto(
  val quote: TickerQuoteDto,
  val indicators: IndicatorsDto?,
  val bars: List<OhlcBarDto>,
)

/**
 * Response payload for the multi-timeframe chart endpoint. Returned by `GET .../{symbol}/chart`.
 *
 * Echoes back the resolved [timeframe] code plus the upstream [range] / [interval] used — that way
 * the frontend can verify what it actually asked for and the upstream picked, useful when debugging
 * cache hits or odd intraday gaps.
 */
data class ChartDto(
  val symbol: String,
  val timeframe: String,
  val range: String,
  val interval: String,
  val bars: List<OhlcBarDto>,
)

/**
 * Response payload for the sector benchmark lookup. Returned by `GET .../{symbol}/sector-benchmark`
 * when a SPDR sector ETF maps to the ticker's GICS sector.
 *
 * [tickerSymbol] echoes back the URL path symbol (uppercased) so the frontend can correlate when
 * multiple lookups are in flight. [etfSymbol] is what the chart fetches next via the regular
 * `/chart` endpoint to draw the overlay ; [sector] / [etfName] feed the legend label.
 */
data class SectorBenchmarkDto(
  val tickerSymbol: String,
  val sector: String,
  val etfSymbol: String,
  val etfName: String,
)

fun SectorBenchmark.toDto(tickerSymbol: String) =
  SectorBenchmarkDto(
    tickerSymbol = tickerSymbol,
    sector = sector,
    etfSymbol = etfSymbol,
    etfName = etfName,
  )

fun TickerQuote.toDto() =
  TickerQuoteDto(
    symbol = symbol,
    name = name,
    currency = currency,
    exchange = exchange,
    price = price,
    fiftyTwoWeekHigh = fiftyTwoWeekHigh,
    fiftyTwoWeekLow = fiftyTwoWeekLow,
    asOf = asOf,
  )

fun Indicators.toDto() =
  IndicatorsDto(
    asOf = asOf,
    price = price,
    rsi14 = rsi14,
    ma50 = ma50,
    ma200 = ma200,
    momentum30d = momentum30d,
    momentum90d = momentum90d,
    perf1m = perf1m,
    perf3m = perf3m,
    perf1y = perf1y,
    drawdownFrom52wHigh = drawdownFrom52wHigh,
    volumeRelative30d = volumeRelative30d,
    distanceToMa50Pct = distanceToMa50Pct,
    distanceToMa200Pct = distanceToMa200Pct,
  )

fun OhlcBar.toDto() =
  OhlcBarDto(
    timestamp = timestamp,
    open = open,
    high = high,
    low = low,
    close = close,
    volume = volume,
  )

fun TickerSnapshot.toDto() =
  TickerSnapshotDto(
    quote = quote.toDto(),
    indicators = indicators?.toDto(),
    bars = bars.map { it.toDto() },
  )
