package com.portfolioai.config.infrastructure

import com.portfolioai.config.application.dto.TestConfigResult
import java.net.http.HttpClient
import java.time.Duration
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * Dedicated probe used by the runtime-config "Tester" buttons. Exists separately from the provider
 * adapters because (a) this should work even when the active provider is `mock` — the user wants to
 * validate a key before switching ; (b) it tests a candidate value, not the saved one, so it cannot
 * reuse beans whose config is already injected.
 *
 * Probes used :
 * - Twelve Data : `GET /quote?symbol=AAPL&apikey=…` — cheap (1 credit), returns a small JSON.
 * - Finnhub : `GET /quote?symbol=AAPL&token=…` — also cheap, single call.
 *
 * Returns a flat `(ok, message)` so the front renders a green/red banner. We deliberately surface
 * the upstream HTTP code and a short truncated body when something fails — knowing whether you
 * typo'd the key vs the upstream is rate-limiting matters.
 */
@Component
class ConfigTestClient(
  @Value("\${market.twelvedata.base-url:https://api.twelvedata.com}")
  private val twelveDataBaseUrl: String,
  @Value("\${market.finnhub.base-url:https://finnhub.io/api/v1}") private val finnhubBaseUrl: String,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  private val rest: RestClient =
    RestClient.builder()
      .requestFactory(
        JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
          )
          .apply { setReadTimeout(Duration.ofSeconds(10)) }
      )
      .defaultHeader("Accept", "application/json")
      .build()

  fun testTwelveData(apiKey: String): TestConfigResult {
    if (apiKey.isBlank()) return TestConfigResult(false, "API key is blank")
    return try {
      val body =
        rest
          .get()
          .uri("$twelveDataBaseUrl/quote?symbol=AAPL&apikey={key}", apiKey)
          .retrieve()
          .body(Map::class.java) ?: return TestConfigResult(false, "Empty response")
      // Twelve Data returns HTTP 200 with `{status: "error", code, message}` on auth/rate-limit
      // failures. We have to inspect the body to know whether the key is valid.
      val status = body["status"]?.toString()
      if (status == "error") {
        val code = body["code"]?.toString() ?: "?"
        val message = body["message"]?.toString()?.take(200) ?: "unknown error"
        TestConfigResult(false, "Twelve Data error $code : $message")
      } else {
        TestConfigResult(true, "OK — Twelve Data accepted the key")
      }
    } catch (e: HttpClientErrorException) {
      log.warn("Twelve Data test failed with {}", e.statusCode)
      TestConfigResult(false, "HTTP ${e.statusCode.value()} from Twelve Data")
    } catch (e: ResourceAccessException) {
      log.warn("Twelve Data test unreachable : {}", e.message)
      TestConfigResult(false, "Unreachable : ${e.message?.take(120)}")
    }
  }

  fun testFinnhub(apiKey: String): TestConfigResult {
    if (apiKey.isBlank()) return TestConfigResult(false, "API key is blank")
    return try {
      // Finnhub returns HTTP 401 with a plain body on bad keys ; the success body is a small JSON
      // with `c` (current price) populated for known symbols.
      val body =
        rest
          .get()
          .uri("$finnhubBaseUrl/quote?symbol=AAPL&token={key}", apiKey)
          .retrieve()
          .body(Map::class.java) ?: return TestConfigResult(false, "Empty response")
      val current = body["c"]
      if (current == null || current == 0 || current == 0.0) {
        TestConfigResult(false, "Finnhub returned no quote — key may be invalid")
      } else {
        TestConfigResult(true, "OK — Finnhub accepted the key")
      }
    } catch (e: HttpClientErrorException) {
      val code = e.statusCode.value()
      val msg =
        when (code) {
          401 -> "Invalid Finnhub API key"
          429 -> "Rate-limited — try again in a minute"
          else -> "HTTP $code from Finnhub"
        }
      log.warn("Finnhub test failed : {}", msg)
      TestConfigResult(false, msg)
    } catch (e: ResourceAccessException) {
      log.warn("Finnhub test unreachable : {}", e.message)
      TestConfigResult(false, "Unreachable : ${e.message?.take(120)}")
    }
  }
}
