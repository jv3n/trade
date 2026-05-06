package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.InstrumentType
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.TickerQuote
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset

/**
 * Pure conversion from Twelve Data's raw shape (string-typed numbers, ISO datetimes) to our domain
 * types ([OhlcBar], [TickerQuote]). Kept separate from [TwelveDataClient] so we can unit test the
 * parsing on JSON fixtures without spinning up MockWebServer.
 */

/**
 * Build the OHLC time series from a `/time_series` payload. Bars where any OHLCV string is null,
 * empty or unparseable are skipped — Twelve Data occasionally emits empty strings on halted /
 * illiquid days, and we'd rather drop a bar than feed `0` into the indicator math.
 *
 * Twelve Data returns the values **most-recent first** by default. Callers expect chronological
 * order (oldest first) for indicator computation, so we reverse here.
 */
fun TwelveDataTimeSeriesResponse.toOhlcBars(): List<OhlcBar> {
  val rawValues = values ?: return emptyList()
  val parsed = rawValues.mapNotNull { v ->
    val ts = parseTimestamp(v.datetime) ?: return@mapNotNull null
    val open = v.open?.toBigDecimalOrNull()
    val high = v.high?.toBigDecimalOrNull()
    val low = v.low?.toBigDecimalOrNull()
    val close = v.close?.toBigDecimalOrNull()
    val volume = v.volume?.toLongOrNull()
    if (open == null || high == null || low == null || close == null || volume == null) {
      null
    } else {
      OhlcBar(timestamp = ts, open = open, high = high, low = low, close = close, volume = volume)
    }
  }
  return parsed.sortedBy { it.timestamp }
}

/**
 * Build the latest quote from a `/quote` payload. Falls back to fields we have when one is missing
 * — Twelve Data sometimes omits `name` (obscure tickers) or `fifty_two_week` (pre-IPO listings).
 *
 * [bars] is used as a fallback for both the price (last close) and the 52-week range when the quote
 * payload is incomplete — happens on TSX small caps where the live quote is sparse but the time
 * series is fine.
 */
fun TwelveDataQuoteResponse.toTickerQuote(symbol: String, bars: List<OhlcBar>): TickerQuote {
  val price = close?.toBigDecimalOrNull() ?: bars.lastOrNull()?.close ?: BigDecimal.ZERO
  val asOf =
    timestamp?.let(Instant::ofEpochSecond)
      ?: datetime?.let(::parseTimestamp)
      ?: bars.lastOrNull()?.timestamp
      ?: Instant.now()
  val (high52, low52) = fiftyTwoWeek?.toRange() ?: bars.toFiftyTwoWeek()
  return TickerQuote(
    symbol = this.symbol ?: symbol,
    name = name,
    currency = currency,
    exchange = exchange,
    price = price,
    fiftyTwoWeekHigh = high52,
    fiftyTwoWeekLow = low52,
    asOf = asOf,
    instrumentType = mapInstrumentType(type),
  )
}

/**
 * Coarse mapping of the `type` string Twelve Data emits in `/quote`. Anything we don't explicitly
 * recognise collapses to [InstrumentType.OTHER] — the front treats that conservatively (no Sector
 * benchmark toggle). `null` input → `null` output so the front can distinguish "we don't know" from
 * "we know it's Other".
 */
internal fun mapInstrumentType(raw: String?): InstrumentType? {
  if (raw.isNullOrBlank()) return null
  return when (raw.trim().lowercase()) {
    "common stock",
    "preferred stock",
    "american depositary receipt",
    "depositary receipt",
    "stock" -> InstrumentType.STOCK
    "etf",
    "exchange-traded fund" -> InstrumentType.ETF
    "index" -> InstrumentType.INDEX
    else -> InstrumentType.OTHER
  }
}

/**
 * Best-effort parse of Twelve Data's `datetime` field. Daily bars come back as `yyyy-MM-dd` ;
 * intraday bars as `yyyy-MM-dd HH:mm:ss`. Anchor everything at UTC — the IndicatorCalculator only
 * cares about ordering, not the wall-clock TZ.
 */
internal fun parseTimestamp(raw: String?): Instant? {
  if (raw.isNullOrBlank()) return null
  return runCatching {
      if (raw.length <= 10) LocalDate.parse(raw).atStartOfDay(ZoneOffset.UTC).toInstant()
      else LocalDateTime.parse(raw.replace(' ', 'T')).toInstant(ZoneOffset.UTC)
    }
    .getOrNull()
}

private fun TwelveDataFiftyTwoWeek.toRange(): Pair<BigDecimal?, BigDecimal?> =
  high?.toBigDecimalOrNull() to low?.toBigDecimalOrNull()

private fun List<OhlcBar>.toFiftyTwoWeek(): Pair<BigDecimal?, BigDecimal?> {
  if (isEmpty()) return null to null
  return maxOf { it.close } to minOf { it.close }
}
