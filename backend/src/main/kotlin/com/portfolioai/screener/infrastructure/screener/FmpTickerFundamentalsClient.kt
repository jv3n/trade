package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.screener.domain.TickerFundamentals
import com.portfolioai.screener.domain.TickerFundamentalsClient
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException

/**
 * Enriches a candidate ticker with the fields FMP's gainers endpoint omits:
 * - **float** ← `GET /stable/shares-float?symbol=…` (the GUS 3M–50M criterion).
 * - **premarket volume** ← `GET /stable/quote?symbol=…` `volume` (a proxy — FMP's quote `volume` is
 *   the cumulative session volume, which equals premarket volume only while polled during the
 *   premarket session ; good enough as a magnitude signal, not an exact premarket figure).
 *
 * **Best-effort, per the [TickerFundamentalsClient] contract** — each call is wrapped so an
 * upstream blip (rate-limit, 403, network) leaves the corresponding field `null` instead of
 * throwing. A missing API key short-circuits to [TickerFundamentals.EMPTY] (no point hitting FMP
 * without auth). The key is read per-call from [AppConfigService] (hot-rotatable from
 * `/settings/configuration`).
 *
 * Reuses the shared `fmpRestClient` bean (cf. [FmpHttpConfig]) — same timeouts as the screener
 * call.
 */
@Component
class FmpTickerFundamentalsClient(
  @Qualifier("fmpRestClient") private val rest: RestClient,
  private val appConfig: AppConfigService,
  @Value("\${screener.fmp.base-url:https://financialmodelingprep.com}") private val baseUrl: String,
) : TickerFundamentalsClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val apiKey: String
    get() = appConfig.getString(ConfigKeys.FMP_API_KEY)

  override fun fetch(symbol: String): TickerFundamentals {
    if (apiKey.isBlank()) return TickerFundamentals.EMPTY
    return TickerFundamentals(
      floatShares = fetchFloat(symbol),
      premarketVolume = fetchVolume(symbol),
    )
  }

  private fun fetchFloat(symbol: String): Long? =
    try {
      rest
        .get()
        .uri("$baseUrl/stable/shares-float?symbol={s}&apikey={k}", symbol, apiKey)
        .retrieve()
        .body(Array<FmpSharesFloat>::class.java)
        ?.firstOrNull()
        ?.floatShares
        ?.takeIf { it > 0 }
    } catch (e: RestClientException) {
      log.warn("FMP shares-float enrichment failed for {}: {}", symbol, e.message)
      null
    }

  private fun fetchVolume(symbol: String): Long? =
    try {
      rest
        .get()
        .uri("$baseUrl/stable/quote?symbol={s}&apikey={k}", symbol, apiKey)
        .retrieve()
        .body(Array<FmpQuote>::class.java)
        ?.firstOrNull()
        ?.volume
        ?.takeIf { it > 0 }
    } catch (e: RestClientException) {
      log.warn("FMP quote enrichment failed for {}: {}", symbol, e.message)
      null
    }
}
