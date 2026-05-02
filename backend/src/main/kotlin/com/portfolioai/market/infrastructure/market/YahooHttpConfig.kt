package com.portfolioai.market.infrastructure.market

import java.net.CookieManager
import java.net.CookiePolicy
import java.net.http.HttpClient
import java.time.Duration
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient

/**
 * Yahoo Finance HTTP plumbing — shared between [YahooSession] (cookie + crumb dance) and
 * [YahooClient] (chart fetches). One [CookieManager], one [HttpClient], one [RestClient] ; cookies
 * acquired during the session warm-up automatically propagate to the chart call because the JDK's
 * `HttpClient` stores them per host in the cookie handler.
 *
 * **Why `JdkClientHttpRequestFactory` and not the default `SimpleClientHttpRequestFactory`** :
 * `HttpURLConnection` has no native cookie handling and silently strips several headers (`Origin`,
 * `Sec-Fetch-*`) — verified empirically in [YahooClientTest]. The Java 11+ `HttpClient` has neither
 * limitation, so it's the right choice here once we need to authenticate.
 *
 * Conditional on `yahoo.provider=yahoo` so we don't instantiate the HTTP plumbing when the mock
 * provider is selected (local dev).
 */
@Configuration
@ConditionalOnProperty(name = ["yahoo.provider"], havingValue = "yahoo", matchIfMissing = true)
class YahooHttpConfig {

  /** Default Chrome UA that Yahoo accepts. Restricting fingerprint debug to one place. */
  private val userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"

  @Bean fun yahooCookieManager(): CookieManager = CookieManager(null, CookiePolicy.ACCEPT_ALL)

  @Bean
  fun yahooHttpClient(cookieManager: CookieManager): HttpClient =
    HttpClient.newBuilder()
      .cookieHandler(cookieManager)
      .connectTimeout(Duration.ofSeconds(5))
      .build()

  @Bean
  fun yahooRestClient(httpClient: HttpClient): RestClient =
    RestClient.builder()
      .requestFactory(JdkClientHttpRequestFactory(httpClient))
      .defaultHeader("User-Agent", userAgent)
      .defaultHeader("Accept", "*/*")
      .defaultHeader("Accept-Language", "en-US,en;q=0.9")
      .defaultHeader("Referer", "https://finance.yahoo.com/")
      .build()
}
