package com.portfolioai.earnings.infrastructure.earnings

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.earnings.domain.EarningsSnapshot
import com.portfolioai.market.domain.MarketUnavailableException
import java.time.LocalDate
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * HTTP adapter to Finnhub for earnings data. Two endpoints involved :
 * - `/stock/earnings?symbol=...` — required, returns the historical EPS estimate / actual array.
 * - `/calendar/earnings?from=...&to=...&symbol=...` — optional, may 401/403 on certain accounts. We
 *   **fail soft** on the calendar call and return the snapshot without the next-date rather than
 *   failing the whole fetch. The report breakdown is still useful on its own — same pattern as the
 *   analyst module's optional price target.
 *
 * Auth pattern mirrors [com.portfolioai.news.infrastructure.news.FinnhubClient] : `token` query
 * parameter read at every call from [AppConfigService] so the user can rotate the Finnhub key from
 * `/settings/configuration` without a reboot. Reuses the same RestClient bean (`finnhubRestClient`)
 * — one set of timeouts and headers across all Finnhub-backed adapters.
 *
 * Error mapping is identical to the analyst and news adapters so the global error UX is uniform :
 * - 401 / 403 on `/stock/earnings` → `MarketUnavailableException("auth-failed")`. (On the calendar
 *   call this fails soft to `null` — see above.)
 * - 429 → `MarketUnavailableException("rate-limited")`
 * - other 4xx → `MarketUnavailableException("client error N")`
 * - 5xx → `MarketUnavailableException("upstream N")`
 * - network → `MarketUnavailableException("unreachable")`
 *
 * Empty `/stock/earnings` array AND empty calendar → `NoSuchElementException` (mapped to 404 by the
 * global handler) — no data at all to surface.
 *
 * No `@Cacheable` here — caching lives one layer up in
 * [com.portfolioai.earnings.application.EarningsService] keyed on the uppercase symbol.
 */
@Component
class FinnhubEarningsClient(
  @Qualifier("finnhubRestClient") private val rest: RestClient,
  private val mapper: ObjectMapper,
  private val appConfig: AppConfigService,
  @Value("\${market.finnhub.base-url:https://finnhub.io/api/v1}") private val baseUrl: String,
) : EarningsClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val apiKey: String
    get() = appConfig.getString(ConfigKeys.FINNHUB_API_KEY)

  override fun fetch(symbol: String): EarningsSnapshot {
    requireApiKey()
    val upper = symbol.uppercase()
    log.info("Fetching Finnhub earnings symbol={}", upper)

    val reports = fetchReports(upper)
    val calendar = fetchCalendarOrNull(upper)
    return toEarningsSnapshot(upper, reports, calendar)
  }

  private fun fetchReports(upper: String): List<FinnhubEarningsItem> {
    val body =
      try {
        rest
          .get()
          .uri("$baseUrl/stock/earnings?symbol={symbol}&token={token}", upper, apiKey)
          .retrieve()
          .body(String::class.java)
      } catch (e: HttpClientErrorException.TooManyRequests) {
        log.warn("Finnhub rate-limited symbol={}", upper)
        throw MarketUnavailableException("rate-limited", e)
      } catch (e: HttpClientErrorException.Unauthorized) {
        log.warn("Finnhub returned 401 — check market.finnhub.api-key")
        throw MarketUnavailableException("auth-failed", e)
      } catch (e: HttpClientErrorException.Forbidden) {
        log.warn("Finnhub returned 403 — endpoint likely behind a paid plan")
        throw MarketUnavailableException("auth-failed", e)
      } catch (e: HttpClientErrorException) {
        log.warn("Finnhub client error {} symbol={}", e.statusCode, upper)
        throw MarketUnavailableException("client error ${e.statusCode}", e)
      } catch (e: HttpServerErrorException) {
        log.warn("Finnhub server error {} symbol={}", e.statusCode, upper)
        throw MarketUnavailableException("upstream ${e.statusCode}", e)
      } catch (e: ResourceAccessException) {
        log.warn("Finnhub unreachable symbol={}: {}", upper, e.message)
        throw MarketUnavailableException("unreachable", e)
      } ?: return emptyList()

    return mapper.readValue(body, object : TypeReference<List<FinnhubEarningsItem>>() {})
  }

  /**
   * Optional second call. We deliberately swallow 401/403/4xx into a `null` because the parent
   * snapshot is still useful without the next-date. Server errors (5xx) and network failures are
   * also absorbed for the same reason — better degrade than fail. We log at `warn` so the operator
   * sees the issue in the Tilt logs without it bubbling to the user.
   *
   * Window : today → today + 90 days. The next quarterly print is at most ~3 months out, querying
   * further would burn quota for stale data.
   */
  private fun fetchCalendarOrNull(upper: String): FinnhubEarningsCalendarResponse? {
    val today = LocalDate.now()
    val to = today.plusDays(CALENDAR_WINDOW_DAYS)
    return try {
      rest
        .get()
        .uri(
          "$baseUrl/calendar/earnings?from={from}&to={to}&symbol={symbol}&token={token}",
          today.toString(),
          to.toString(),
          upper,
          apiKey,
        )
        .retrieve()
        .body(FinnhubEarningsCalendarResponse::class.java)
    } catch (e: HttpClientErrorException) {
      log.warn(
        "Finnhub calendar/earnings {} symbol={} — surfacing snapshot without next-date",
        e.statusCode,
        upper,
      )
      null
    } catch (e: HttpServerErrorException) {
      log.warn(
        "Finnhub calendar/earnings upstream {} symbol={} — surfacing snapshot without next-date",
        e.statusCode,
        upper,
      )
      null
    } catch (e: ResourceAccessException) {
      log.warn(
        "Finnhub calendar/earnings unreachable symbol={} — surfacing snapshot without next-date",
        upper,
      )
      null
    }
  }

  private fun requireApiKey() {
    if (apiKey.isBlank()) {
      throw MarketUnavailableException(
        "Finnhub API key is missing — set market.finnhub.api-key (env FINNHUB_API_KEY)"
      )
    }
  }

  private companion object {
    const val CALENDAR_WINDOW_DAYS = 90L
  }
}
