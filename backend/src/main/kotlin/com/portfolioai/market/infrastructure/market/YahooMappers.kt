package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.TickerQuote
import java.math.BigDecimal
import java.time.Instant

/**
 * Pure conversion from Yahoo's raw JSON shape ([YahooChartResult]) to our domain types ([OhlcBar],
 * [TickerQuote]). Kept separate from [YahooClient] so we can unit-test parsing on a JSON fixture
 * without spinning up the HTTP plumbing.
 */

/**
 * Build the OHLC time-series from the chart payload. Bars where any of OHLCV is `null` (Yahoo
 * returns nulls for halted days) are skipped — we'd rather drop a bar than let it pollute the
 * indicator calculation.
 */
fun YahooChartResult.toOhlcBars(): List<OhlcBar> {
  val ts = timestamp ?: return emptyList()
  val series = indicators?.quote?.firstOrNull() ?: return emptyList()
  val o = series.open ?: return emptyList()
  val h = series.high ?: return emptyList()
  val l = series.low ?: return emptyList()
  val c = series.close ?: return emptyList()
  val v = series.volume ?: return emptyList()

  return ts.indices.mapNotNull { i ->
    val open = o.getOrNull(i)
    val high = h.getOrNull(i)
    val low = l.getOrNull(i)
    val close = c.getOrNull(i)
    val volume = v.getOrNull(i)
    if (open == null || high == null || low == null || close == null || volume == null) {
      null
    } else {
      OhlcBar(
        timestamp = Instant.ofEpochSecond(ts[i]),
        open = open,
        high = high,
        low = low,
        close = close,
        volume = volume,
      )
    }
  }
}

/**
 * Extract the latest quote from the chart payload. Falls back to the close of the most recent bar
 * if `regularMarketPrice` is missing — happens on tickers that Yahoo returns historical data for
 * but no live quote (delisted, archived).
 */
fun YahooChartResult.toTickerQuote(): TickerQuote {
  val price = meta.regularMarketPrice ?: lastBarClose() ?: BigDecimal.ZERO
  val asOf =
    meta.regularMarketTime?.let(Instant::ofEpochSecond) ?: lastBarTimestamp() ?: Instant.now()
  return TickerQuote(
    symbol = meta.symbol,
    name = meta.longName ?: meta.shortName,
    currency = meta.currency,
    exchange = meta.fullExchangeName,
    price = price,
    fiftyTwoWeekHigh = meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow = meta.fiftyTwoWeekLow,
    asOf = asOf,
  )
}

private fun YahooChartResult.lastBarClose(): BigDecimal? {
  val closes = indicators?.quote?.firstOrNull()?.close ?: return null
  return closes.lastOrNull { it != null }
}

private fun YahooChartResult.lastBarTimestamp(): Instant? =
  timestamp?.lastOrNull()?.let(Instant::ofEpochSecond)
