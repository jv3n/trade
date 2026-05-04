package com.portfolioai.news.infrastructure.news

import java.net.http.HttpClient
import java.time.Duration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient

/**
 * Finnhub HTTP plumbing — single [RestClient] reused by [FinnhubClient]. Same conventions as the
 * Twelve Data adapter : explicit connect / read timeouts so a slow upstream can't hold a Tomcat
 * worker thread, JSON-only `Accept` header. No cookie handling needed (auth is the `token` query
 * parameter).
 *
 * Always instantiated — the routing layer ([RoutingNewsClient]) decides at call time which adapter
 * to dispatch to based on the runtime config. Cost is one extra `RestClient` in memory even when
 * `news.provider=mock` ; negligible.
 */
@Configuration
class FinnhubHttpConfig {

  @Bean
  fun finnhubRestClient(): RestClient {
    val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    val factory =
      JdkClientHttpRequestFactory(httpClient).apply { setReadTimeout(Duration.ofSeconds(10)) }
    return RestClient.builder()
      .requestFactory(factory)
      .defaultHeader("Accept", "application/json")
      .build()
  }
}
