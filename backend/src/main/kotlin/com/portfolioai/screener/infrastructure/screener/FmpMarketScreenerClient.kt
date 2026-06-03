package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.screener.domain.MarketScreenerClient
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.domain.TickerMover
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import java.math.RoundingMode
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * HTTP client to FMP's top-movers endpoints — the Phase 6 v0.3 source for the market radar after
 * the Polygon free tier proved too limited (both snapshot and grouped-daily returned 403 on the
 * 2026-rebranded free Basic plan).
 *
 * Two endpoints, two calls per refresh :
 * - `GET /stable/biggest-gainers?apikey=…` — top gainers
 * - `GET /stable/biggest-losers?apikey=…` — top losers
 *
 * **Endpoint migration August 2025** : the legacy `/api/v3/stock_market/gainers` returns `403
 * "Legacy Endpoint : … only available for legacy users who have valid subscriptions prior August
 * 31, 2025"`. The `/stable/biggest-*` paths are the post-migration replacement and serve the exact
 * same JSON shape, so only the URL template changed — DTOs are unaffected.
 *
 * The two payloads are merged so the radar can surface both gap-up and gap-down candidates in one
 * shot. Each endpoint returns ~50 entries (no pagination, no universe parameter), so the radar is
 * bounded to ~100 movers per refresh regardless of the user's filter — the in-process
 * `MarketScreenerService` filter then narrows further by `gapPctMin`, etc.
 *
 * **Limitations vs the design intent** :
 * - **No volume signal** — FMP's gainers/losers endpoint does not expose `volume` or
 *   `volumeAvg30d`. The adapter fills both with `0` and `volumeRatio` with `BigDecimal.ZERO`, which
 *   means the radar's `volumeRatioMin` filter becomes no-op when FMP is the active provider. Users
 *   must drop `volumeRatioMin` to 0 in the panel to see results (i18n hint added in the Settings
 *   card description, and `FmpProviderNoteBanner` will surface this in the radar page in a
 *   follow-up ticket if the UX friction warrants).
 * - **Bounded universe** — only the top 50 of each direction. A ticker that's beyond the top-50
 *   gainers but still has +5 % gap won't be surfaced.
 * - **No `marketCapUsd`, `sector`** — same sentinel-zero / null fallback as the Polygon adapter ;
 *   the cap-range and sector filters are no-op for FMP-sourced movers.
 *
 * **What FMP gets right vs Polygon free tier** :
 * - `name` is populated → the radar displays the issuer name without a separate enrichment call.
 * - `exchange` is populated → the universe's exchange bound is enforced at the adapter level (Phase
 *   6 ticket (8) v0.5). Non-NASDAQ entries are dropped before the snapshot is persisted.
 *
 * Auth : the API key is read at every call from [AppConfigService] (DB override layered on top of
 * the YAML default `screener.fmp.api-key` / env var `FMP_API_KEY`). Reading per-call is required
 * because the user rotates the key from `/settings/configuration` without a reboot.
 */
@Component
class FmpMarketScreenerClient(
  @Qualifier("fmpRestClient") private val rest: RestClient,
  private val appConfig: AppConfigService,
  @Value("\${screener.fmp.base-url:https://financialmodelingprep.com}") private val baseUrl: String,
) : MarketScreenerClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val apiKey: String
    get() = appConfig.getString(ConfigKeys.FMP_API_KEY)

  override fun snapshotMovers(universe: ScreenerUniverse): List<TickerMover> {
    requireApiKey()
    val gainers = fetchMovers("biggest-gainers")
    val losers = fetchMovers("biggest-losers")
    val all = (gainers + losers).mapNotNull { it.toMoverOrNull() }
    // FMP carries `exchange` on each entry — honor the universe's exchange bound at the adapter
    // level (Phase 6 ticket (8)). Cap range is NOT honored because the payload doesn't expose
    // `marketCapUsd` — Phase 6 ticket (1bis) covers the cap-aware path via the nightly
    // `ticker_reference` join.
    val scoped = all.filter { it.exchange.equals(universe.exchange, ignoreCase = true) }
    log.info(
      "FMP movers : gainers={} losers={} parsed={} after exchange={} filter={}",
      gainers.size,
      losers.size,
      all.size,
      universe.exchange,
      scoped.size,
    )
    return scoped
  }

  private fun fetchMovers(path: String): List<FmpMoverEntry> {
    return try {
      val response =
        rest
          .get()
          .uri("$baseUrl/stable/$path?apikey={key}", apiKey)
          .retrieve()
          .body(Array<FmpMoverEntry>::class.java)
      response?.toList() ?: emptyList()
    } catch (e: HttpClientErrorException.TooManyRequests) {
      log.warn("FMP rate-limited on $path")
      throw UpstreamUnavailableException("rate-limited", e)
    } catch (e: HttpClientErrorException.Unauthorized) {
      log.warn("FMP auth-failed on $path")
      throw UpstreamUnavailableException("auth-failed: invalid FMP API key", e)
    } catch (e: HttpClientErrorException.Forbidden) {
      log.warn("FMP forbidden on $path")
      throw UpstreamUnavailableException("auth-failed: FMP plan does not allow this endpoint", e)
    } catch (e: HttpClientErrorException) {
      log.warn("FMP client error {} on $path", e.statusCode)
      throw UpstreamUnavailableException("client error ${e.statusCode}", e)
    } catch (e: HttpServerErrorException) {
      log.warn("FMP server error {} on $path", e.statusCode)
      throw UpstreamUnavailableException("upstream ${e.statusCode}", e)
    } catch (e: ResourceAccessException) {
      log.warn("FMP unreachable on $path: {}", e.message)
      throw UpstreamUnavailableException("unreachable", e)
    }
  }

  private fun requireApiKey() {
    if (apiKey.isBlank()) {
      throw UpstreamUnavailableException(
        "FMP API key is missing — set screener.fmp.api-key (env FMP_API_KEY)"
      )
    }
  }

  /**
   * Maps an FMP mover entry to a `TickerMover`, or `null` if required fields are missing/zero.
   * `previousClose` is derived from `price - change` because the endpoint doesn't expose it
   * directly. `volume`, `volumeAvg30d`, `volumeRatio`, `marketCapUsd` and `sector` are filled with
   * sentinels (see class KDoc).
   */
  private fun FmpMoverEntry.toMoverOrNull(): TickerMover? {
    val sym = symbol?.takeIf { it.isNotBlank() } ?: return null
    val px = price?.takeIf { it > BigDecimal.ZERO } ?: return null
    val chg = change ?: return null
    val gap = changesPercentage ?: return null
    val prevClose = px.subtract(chg).setScale(2, RoundingMode.HALF_UP)
    if (prevClose <= BigDecimal.ZERO) return null
    return TickerMover(
      symbol = sym,
      name = name?.takeIf { it.isNotBlank() } ?: sym,
      price = px,
      previousClose = prevClose,
      gapPct = gap.setScale(2, RoundingMode.HALF_UP),
      volume = 0L,
      volumeAvg30d = 0L,
      volumeRatio = BigDecimal.ZERO,
      marketCapUsd = 0L,
      exchange = exchange ?: "",
      sector = null,
    )
  }
}
