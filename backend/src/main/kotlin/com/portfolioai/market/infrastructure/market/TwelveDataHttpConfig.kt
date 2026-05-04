package com.portfolioai.market.infrastructure.market

import java.net.http.HttpClient
import java.time.Duration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient

/**
 * Twelve Data HTTP plumbing — a single [RestClient] reused by [TwelveDataClient] for both the
 * `/time_series` and `/quote` calls. No cookie store, no fingerprint headers : Twelve Data exposes
 * a documented REST API, the only auth we need is the `apikey` query parameter.
 *
 * **Timeouts** — connect 5 s, read 10 s. Without them the default `RestClient` waits forever ; a
 * backend thread blocked on a slow DNS lookup or a stalled TLS handshake would tie up a Tomcat
 * worker even after the front-end abort fires.
 *
 * Always instantiated — the routing layer ([RoutingMarketChartClient]) decides at call time which
 * adapter to dispatch to based on the runtime config. Cost is one extra `RestClient` in memory even
 * when `market.provider=mock` ; negligible.
 */
@Configuration
class TwelveDataHttpConfig {

  @Bean
  fun twelveDataRestClient(): RestClient {
    val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    val factory =
      JdkClientHttpRequestFactory(httpClient).apply { setReadTimeout(Duration.ofSeconds(10)) }
    return RestClient.builder()
      .requestFactory(factory)
      .defaultHeader("Accept", "application/json")
      .build()
  }
}
