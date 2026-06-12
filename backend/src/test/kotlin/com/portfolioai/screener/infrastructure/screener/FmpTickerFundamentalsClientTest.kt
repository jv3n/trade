package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import org.springframework.web.client.RestClient

/**
 * Tests on [FmpTickerFundamentalsClient] against a local [MockWebServer]. Pins:
 * - **Happy path** : `shares-float` → `floatShares`, `quote` → `premarketVolume`, both parsed.
 * - **Best-effort contract** : a 4xx/5xx on either call leaves that field `null` instead of
 *   throwing — a fundamentals blip must never fail the whole radar refresh.
 * - **Blank-key short-circuit** : no request is fired against the daily quota.
 */
class FmpTickerFundamentalsClientTest {

  private lateinit var server: MockWebServer

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
  }

  @AfterEach
  fun tearDown() {
    server.shutdown()
  }

  private fun clientWith(key: String): FmpTickerFundamentalsClient {
    val appConfig: AppConfigService = mock()
    whenever(appConfig.getString(ConfigKeys.FMP_API_KEY)).doReturn(key)
    return FmpTickerFundamentalsClient(
      rest = RestClient.builder().build(),
      appConfig = appConfig,
      baseUrl = server.url("/").toString().trimEnd('/'),
    )
  }

  @Test
  fun `parses float from shares-float and volume from quote`() {
    server.enqueue(jsonOk("""[{"symbol":"GNS","floatShares":12000000}]"""))
    server.enqueue(jsonOk("""[{"symbol":"GNS","volume":850000}]"""))

    val f = clientWith("key").fetch("GNS")

    assertEquals(12_000_000L, f.floatShares)
    assertEquals(850_000L, f.premarketVolume)
  }

  @Test
  fun `leaves a field null when its call fails, keeping the other`() {
    server.enqueue(MockResponse().setResponseCode(403)) // shares-float fails
    server.enqueue(jsonOk("""[{"symbol":"GNS","volume":850000}]"""))

    val f = clientWith("key").fetch("GNS")

    assertNull(f.floatShares) // failed call → null, no throw
    assertEquals(850_000L, f.premarketVolume) // the other call still works
  }

  @Test
  fun `short-circuits to EMPTY with a blank key, firing no request`() {
    val f = clientWith("").fetch("GNS")

    assertNull(f.floatShares)
    assertNull(f.premarketVolume)
    assertEquals(0, server.requestCount)
  }

  private fun jsonOk(body: String) =
    MockResponse().setHeader("Content-Type", "application/json").setBody(body)
}
