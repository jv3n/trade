package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.screener.domain.MarketScreenerClient
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.domain.TickerMover
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.ZoneId
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * HTTP client to Polygon's grouped-daily endpoint — the Phase 6 v0.2 source for the market radar.
 * Polygon was rebranded **Massive** in 2026 ; the API base moved to `api.massive.com`. The class +
 * bean + config key names keep the `polygon` slug because that's still the historical identifier
 * devs grep for.
 *
 * **Why the grouped-daily endpoint rather than the snapshot endpoint** : the original Phase 6
 * Sprint 2 design called `/v2/snapshot/locale/us/markets/stocks/tickers` (one call, real-time, with
 * `todaysChangePerc` pre-computed). Testing live revealed that endpoint is **not included in the
 * Polygon Stocks Basic free tier** (it requires Stocks Starter ~$29/mo). The pivot to
 * `/v2/aggs/grouped/locale/us/market/stocks/{date}` lands on a **Basic-free** endpoint that returns
 * OHLCV bars for all US stocks on a single date — at the cost of (a) **EOD-only data** (no
 * intra-day intelligence on the free tier) and (b) **two calls per refresh** to compute a gap
 * (today's EOD vs yesterday's EOD).
 *
 * **EOD nature of the radar** — the radar now answers "what moved a lot **yesterday**" rather than
 * "what's moving **right now** at the open". For a pump precursor pattern that fades within the
 * trading day, this is less actionable, but it's the honest free-tier signal. Triggering an upgrade
 * to Polygon Starter would unlock real-time snapshots ; the adapter is structured so the swap would
 * only touch this file (the `screener/` API shape is provider-agnostic).
 *
 * **Two-call algorithm** :
 * 1. Walk back from "today" in `America/New_York` (US trading calendar) up to
 *    [TRADING_DAY_LOOKBACK] days to find the most recent date whose grouped call returns a
 *    non-empty `results` list. Call this `t1` (latest trading day with EOD data).
 * 2. Walk back from `t1 - 1 day` up to [TRADING_DAY_LOOKBACK] more days to find the previous
 *    trading day. Call this `t0`.
 * 3. Join the two payloads by ticker symbol (`T`), compute `gapPct = (t1.c - t0.c) / t0.c * 100`.
 * 4. Skip tickers that don't have a bar on both dates (recently IPO'd or delisted).
 *
 * Worst-case 2 + 5 + 5 = 12 calls per refresh (a long weekend with consecutive holidays). Typical 2
 * calls. The Polygon free tier 5 req/min ceiling means a refresh during a long weekend can burn the
 * quota — caching is filed as Phase 6 (1ter) follow-up.
 *
 * **Degraded enrichment carries over from Sprint 2** — the grouped-daily endpoint still doesn't
 * surface `name`, `exchange`, `sector`, `marketCapUsd`, or a true 30-day average volume. The
 * adapter fills them with the same sentinels as before (`name = T`, `exchange = ""`, `sector =
 * null`, `marketCapUsd = 0L`, `volumeAvg30d = t0.v` as a single-day proxy).
 *
 * Auth : the API key is read at every call from [AppConfigService] (DB override layered on top of
 * the YAML default `screener.polygon.api-key` / env var `POLYGON_API_KEY`). Reading per-call is
 * required because the user rotates the key from `/settings/configuration` without a reboot.
 */
@Component
class PolygonMarketScreenerClient(
  @Qualifier("polygonRestClient") private val rest: RestClient,
  private val appConfig: AppConfigService,
  @Value("\${screener.polygon.base-url:https://api.massive.com}") private val baseUrl: String,
) : MarketScreenerClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val apiKey: String
    get() = appConfig.getString(ConfigKeys.POLYGON_API_KEY)

  override fun snapshotMovers(universe: ScreenerUniverse): List<TickerMover> {
    requireApiKey()
    val today = LocalDate.now(ZoneId.of(NEW_YORK_TZ))
    val recent = findMostRecentTradingDay(startFrom = today)
    val previous = findMostRecentTradingDay(startFrom = recent.date.minusDays(1))
    log.info(
      "Polygon grouped-daily : recent={} ({} bars) vs previous={} ({} bars)",
      recent.date,
      recent.bars.size,
      previous.date,
      previous.bars.size,
    )
    val previousByTicker = previous.bars.mapNotNull { it.T?.let { sym -> sym to it } }.toMap()
    return recent.bars.mapNotNull { it.toMoverOrNull(previousByTicker) }
  }

  /**
   * Walks the calendar back from [startFrom] up to [TRADING_DAY_LOOKBACK] days, returning the first
   * date that yields a non-empty grouped payload. Throws [UpstreamUnavailableException] if no
   * trading day is found in that window — a 12-day stretch without market data is implausible
   * outside of an outage on Polygon's side.
   */
  private fun findMostRecentTradingDay(startFrom: LocalDate): TradingDayBars {
    var probe = startFrom
    repeat(TRADING_DAY_LOOKBACK) {
      val bars = fetchGroupedBars(probe)
      if (bars.isNotEmpty()) return TradingDayBars(probe, bars)
      log.debug("Polygon grouped-daily {} returned no bars — stepping back one day", probe)
      probe = probe.minusDays(1)
    }
    throw UpstreamUnavailableException(
      "Polygon returned no trading-day bars in the last $TRADING_DAY_LOOKBACK calendar days starting $startFrom"
    )
  }

  private fun fetchGroupedBars(date: LocalDate): List<PolygonGroupedBar> {
    val response =
      try {
        rest
          .get()
          .uri(
            "$baseUrl/v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true&apiKey={key}",
            date.toString(),
            apiKey,
          )
          .retrieve()
          .body(PolygonGroupedResponse::class.java)
          ?: throw UpstreamUnavailableException("Polygon returned empty grouped body for $date")
      } catch (e: HttpClientErrorException.TooManyRequests) {
        log.warn("Polygon rate-limited on grouped {}", date)
        throw UpstreamUnavailableException("rate-limited", e)
      } catch (e: HttpClientErrorException.Unauthorized) {
        log.warn("Polygon auth-failed on grouped {}", date)
        throw UpstreamUnavailableException("auth-failed: invalid Polygon API key", e)
      } catch (e: HttpClientErrorException.Forbidden) {
        log.warn("Polygon forbidden on grouped {}", date)
        throw UpstreamUnavailableException(
          "auth-failed: Polygon plan does not allow this endpoint",
          e,
        )
      } catch (e: HttpClientErrorException) {
        log.warn("Polygon client error {} on grouped {}", e.statusCode, date)
        throw UpstreamUnavailableException("client error ${e.statusCode}", e)
      } catch (e: HttpServerErrorException) {
        log.warn("Polygon server error {} on grouped {}", e.statusCode, date)
        throw UpstreamUnavailableException("upstream ${e.statusCode}", e)
      } catch (e: ResourceAccessException) {
        log.warn("Polygon unreachable on grouped {}: {}", date, e.message)
        throw UpstreamUnavailableException("unreachable", e)
      }
    return response.results.orEmpty()
  }

  private fun requireApiKey() {
    if (apiKey.isBlank()) {
      throw UpstreamUnavailableException(
        "Polygon API key is missing — set screener.polygon.api-key (env POLYGON_API_KEY)"
      )
    }
  }

  /**
   * Maps a recent-day bar to a [TickerMover] using the previous-day bar joined by symbol. Returns
   * `null` if any required field is missing/zero on either side, or if the symbol isn't present on
   * the previous day (recently IPO'd ticker).
   */
  private fun PolygonGroupedBar.toMoverOrNull(
    previousByTicker: Map<String, PolygonGroupedBar>
  ): TickerMover? {
    val sym = T?.takeIf { it.isNotBlank() } ?: return null
    val price = c?.takeIf { it > BigDecimal.ZERO } ?: return null
    val vol = v?.takeIf { it > 0L } ?: return null
    val prev = previousByTicker[sym] ?: return null
    val prevClose = prev.c?.takeIf { it > BigDecimal.ZERO } ?: return null
    val prevVol = prev.v?.takeIf { it > 0L } ?: return null
    val gapPct =
      price
        .subtract(prevClose)
        .divide(prevClose, 4, RoundingMode.HALF_UP)
        .multiply(BigDecimal(100))
        .setScale(2, RoundingMode.HALF_UP)
    val volumeRatio = BigDecimal(vol).divide(BigDecimal(prevVol), 2, RoundingMode.HALF_UP)
    return TickerMover(
      symbol = sym,
      name = sym,
      price = price,
      previousClose = prevClose,
      gapPct = gapPct,
      volume = vol,
      volumeAvg30d = prevVol,
      volumeRatio = volumeRatio,
      marketCapUsd = 0L,
      exchange = "",
      sector = null,
    )
  }

  private data class TradingDayBars(val date: LocalDate, val bars: List<PolygonGroupedBar>)

  companion object {
    private const val NEW_YORK_TZ = "America/New_York"
    private const val TRADING_DAY_LOOKBACK = 6
  }
}
