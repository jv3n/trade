package com.portfolioai.forex.infrastructure.http

import com.github.benmanes.caffeine.cache.Cache
import com.github.benmanes.caffeine.cache.Caffeine
import com.portfolioai.forex.domain.ForexRate
import com.portfolioai.forex.domain.ForexRateClient
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import java.time.LocalDate
import java.util.concurrent.TimeUnit
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * HTTP client to [Frankfurter](https://frankfurter.dev) — keyless, ECB-backed reference rates. The
 * account page needs a single, slowly-moving figure (USD→CAD) for cosmetic balance conversion, so a
 * free daily reference rate is a better fit than a metered real-time forex API.
 *
 * One endpoint : `GET /latest?base={base}&symbols={quote}` →
 * `{"amount":1.0,"base":"USD","date":"2026-06-15","rates":{"CAD":1.3712}}`. We read only `date` and
 * `rates[quote]`.
 *
 * **Caching** — Frankfurter republishes once per business day (~16:00 CET). A 6 h in-memory
 * Caffeine TTL keeps the figure same-day fresh while sparing the (unmetered, but
 * courteous-to-spare) API. A tiny standalone cache rather than the shared Caffeine `CacheManager` :
 * forex lives in its own module and a second unqualified `CacheManager` bean would make the
 * `market/` `@Cacheable` resolution ambiguous.
 *
 * **Fail-soft** — a 4xx/5xx, an unreachable host, an empty body, or a missing quote all raise
 * [UpstreamUnavailableException] (mapped to HTTP 503 globally). Nothing is cached on failure, so
 * the next call retries ; the front-end keeps the balance in USD meanwhile.
 */
@Component
class FrankfurterForexClient(
  @Qualifier("forexRestClient") private val rest: RestClient,
  @Value("\${forex.frankfurter.base-url:https://api.frankfurter.dev/v1}")
  private val baseUrl: String,
) : ForexRateClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val cache: Cache<String, ForexRate> =
    Caffeine.newBuilder().expireAfterWrite(6, TimeUnit.HOURS).maximumSize(16).build()

  override fun latest(base: String, quote: String): ForexRate =
    cache.get("$base|$quote") { fetch(base, quote) }

  private fun fetch(base: String, quote: String): ForexRate {
    log.info("Fetching Frankfurter latest rate base={} quote={}", base, quote)
    val response =
      try {
        rest
          .get()
          .uri("$baseUrl/latest?base={base}&symbols={quote}", base, quote)
          .retrieve()
          .body(FrankfurterLatestResponse::class.java)
      } catch (e: HttpClientErrorException) {
        log.warn("Frankfurter client error {} for {}->{}", e.statusCode, base, quote)
        throw UpstreamUnavailableException("client error ${e.statusCode}", e)
      } catch (e: HttpServerErrorException) {
        log.warn("Frankfurter server error {} for {}->{}", e.statusCode, base, quote)
        throw UpstreamUnavailableException("upstream ${e.statusCode}", e)
      } catch (e: ResourceAccessException) {
        log.warn("Frankfurter unreachable for {}->{}: {}", base, quote, e.message)
        throw UpstreamUnavailableException("unreachable", e)
      }
        ?: throw UpstreamUnavailableException(
          "Frankfurter returned an empty body for $base->$quote"
        )

    val rate =
      response.rates[quote]
        ?: throw UpstreamUnavailableException("Frankfurter returned no $quote rate for base $base")
    return ForexRate(base = base, quote = quote, rate = rate, asOf = response.date)
  }
}

/** Subset of Frankfurter's `/latest` payload we consume — the publish date and the rate map. */
private data class FrankfurterLatestResponse(
  val date: LocalDate,
  val rates: Map<String, BigDecimal>,
)
