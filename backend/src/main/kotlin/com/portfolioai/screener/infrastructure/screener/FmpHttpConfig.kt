package com.portfolioai.screener.infrastructure.screener

import java.net.http.HttpClient
import java.time.Duration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient

/**
 * Financial Modeling Prep (FMP) HTTP plumbing — a single [RestClient] reused by
 * [FmpMarketScreenerClient] for the gainers and losers calls. Same shape as `TwelveDataHttpConfig`
 * / `FinnhubHttpConfig` / `PolygonHttpConfig` for symmetry.
 *
 * **Timeouts** — connect 5 s, read 10 s. FMP's gainers endpoint returns ~50 entries (~5–10 kB),
 * lighter than Polygon's grouped-daily (~500 kB-1 MB).
 *
 * Always instantiated — the routing layer ([RoutingMarketScreenerClient]) decides at call time
 * which adapter to dispatch to.
 */
@Configuration
class FmpHttpConfig {

  @Bean
  fun fmpRestClient(): RestClient {
    val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    val factory =
      JdkClientHttpRequestFactory(httpClient).apply { setReadTimeout(Duration.ofSeconds(10)) }
    return RestClient.builder()
      .requestFactory(factory)
      .defaultHeader("Accept", "application/json")
      .build()
  }
}
