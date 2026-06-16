package com.portfolioai.forex.infrastructure.http

import java.net.http.HttpClient
import java.time.Duration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient

/**
 * Forex HTTP plumbing — a single [RestClient] used by [FrankfurterForexClient] for the `/latest`
 * call. No auth header : Frankfurter is a keyless public API, the currency pair travels as query
 * params.
 *
 * **Timeouts** — connect 5 s, read 10 s. Same rationale as the other provider clients : without
 * them a stalled TLS handshake or slow DNS lookup would pin a Tomcat worker indefinitely.
 */
@Configuration
class ForexHttpConfig {

  @Bean
  fun forexRestClient(): RestClient {
    val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    val factory =
      JdkClientHttpRequestFactory(httpClient).apply { setReadTimeout(Duration.ofSeconds(10)) }
    return RestClient.builder()
      .requestFactory(factory)
      .defaultHeader("Accept", "application/json")
      .build()
  }
}
