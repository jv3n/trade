package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.MarketUnavailableException
import java.time.Duration
import java.time.Instant
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * Manages the cookie + crumb dance Yahoo Finance expects from authenticated clients.
 *
 * The dance, as practised by `yfinance` and other widely-used libraries :
 * 1. `GET https://fc.yahoo.com/` — Yahoo replies with `Set-Cookie` containing the session cookies
 *    (`A1`, `A3`…). Our shared `CookieManager` (see [YahooHttpConfig]) stores them automatically.
 * 2. `GET https://query1.finance.yahoo.com/v1/test/getcrumb` — with the cookies from step 1, Yahoo
 *    returns a short opaque token in the response body. This is the **crumb** — a CSRF-style proof
 *    that the warm-up was done in the same session.
 * 3. Every subsequent chart call must include `?crumb=<token>` AND the cookies (auto via the
 *    `CookieManager`).
 *
 * Without this dance, modern Yahoo IPs increasingly refuse the chart endpoint with 429 responses
 * that look like rate-limits but are actually missing-auth refusals.
 *
 * Cached for [TTL] minutes to avoid the warm-up on every chart call. Invalidated explicitly by
 * [YahooClient] when the chart endpoint returns 401 (crumb expired server-side).
 */
@Component
@ConditionalOnProperty(name = ["yahoo.provider"], havingValue = "yahoo", matchIfMissing = true)
class YahooSession(
  private val rest: RestClient,
  @Value("\${yahoo.session.warmup-url:https://fc.yahoo.com/}") private val warmupUrl: String,
  @Value("\${yahoo.session.crumb-url:https://query1.finance.yahoo.com/v1/test/getcrumb}")
  private val crumbUrl: String,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Volatile private var crumb: String? = null
  @Volatile private var fetchedAt: Instant? = null

  /** Returns a valid crumb, refreshing the session if the cache has expired. Thread-safe. */
  @Synchronized
  fun getCrumb(): String {
    val cached = crumb
    val ts = fetchedAt
    if (cached != null && ts != null && Duration.between(ts, Instant.now()) < TTL) return cached
    return refresh()
  }

  /** Drops the cached crumb so the next [getCrumb] re-runs the full warm-up + crumb fetch. */
  @Synchronized
  fun invalidate() {
    crumb = null
    fetchedAt = null
  }

  private fun refresh(): String {
    log.info("Refreshing Yahoo session — warm-up + crumb fetch")
    try {
      // Step 1 — warm-up to seed cookies. Yahoo sometimes returns 404 on `fc.yahoo.com` ; the
      // cookies are still set in the response, which is what we actually need. We swallow the
      // status because what matters is the side-effect on the cookie store.
      runCatching { rest.get().uri(warmupUrl).retrieve().toBodilessEntity() }

      // Step 2 — fetch the crumb. Body is plain text, typically 11 chars (e.g. "iJk9XmL2.AB").
      val body = rest.get().uri(crumbUrl).retrieve().body(String::class.java)
      val token = body?.trim().orEmpty()
      if (token.isBlank()) {
        throw MarketUnavailableException("Yahoo crumb endpoint returned an empty body")
      }
      crumb = token
      fetchedAt = Instant.now()
      log.info("Yahoo crumb refreshed (length={})", token.length)
      return token
    } catch (e: HttpClientErrorException) {
      log.warn(
        "Yahoo session HTTP error {} — body={}",
        e.statusCode,
        e.responseBodyAsString.take(200),
      )
      throw MarketUnavailableException("Yahoo session ${e.statusCode}", e)
    } catch (e: ResourceAccessException) {
      log.warn("Yahoo session unreachable: {}", e.message)
      throw MarketUnavailableException("Yahoo session unreachable", e)
    }
  }

  companion object {
    /**
     * Yahoo crumbs stay valid much longer than this in practice ; 30 min is a safety margin to
     * avoid serving stale tokens after a server-side rotation.
     */
    private val TTL: Duration = Duration.ofMinutes(30)
  }
}
