package com.portfolioai.screener.infrastructure.screener

import java.net.http.HttpClient
import java.time.Duration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient

/**
 * Polygon (rebranded Massive) HTTP plumbing — a single [RestClient] reused by
 * [PolygonMarketScreenerClient] for the snapshot endpoint. Same shape as `TwelveDataHttpConfig` /
 * `FinnhubHttpConfig` for symmetry.
 *
 * **Timeouts** — connect 5 s, read 15 s. The snapshot endpoint returns the full Nasdaq Composite
 * (~3500 entries, ~600 kB JSON), which is heavier than the per-ticker calls of Twelve Data /
 * Finnhub — hence the bumped read timeout.
 *
 * Always instantiated — the routing layer ([RoutingMarketScreenerClient]) decides at call time
 * which adapter to dispatch to based on the runtime config.
 */
@Configuration
class PolygonHttpConfig {

  @Bean
  fun polygonRestClient(): RestClient {
    val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    val factory =
      JdkClientHttpRequestFactory(httpClient).apply { setReadTimeout(Duration.ofSeconds(15)) }
    return RestClient.builder()
      .requestFactory(factory)
      .defaultHeader("Accept", "application/json")
      .build()
  }
}
