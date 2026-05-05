package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.MarketUnavailableException
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.springframework.web.client.RestClient

/**
 * Tests on [TwelveDataSectorClassifier] — pins the HTTP shape and error mapping for `/profile`
 * against a local [MockWebServer]. Same design as [TwelveDataSymbolSearchClientTest] : the upstream
 * is quota-bound (1 credit / call on the free tier) so we don't burn budget in CI.
 *
 * What we pin :
 * - **Happy path** — `sector` field deserialised and routed through [SpdrSectorEtfs] for the SPDR
 *   ETF lookup.
 * - **Sector outside the SPDR mapping** → [NoSuchElementException] — different surface from the
 *   "symbol not found" 404, but identical user-facing outcome ("no benchmark available").
 * - **Error mapping** — `status: error code: 404/401/403/429` and HTTP 429 surface uniformly with
 *   the chart and search adapters (same `MarketUnavailableException` / `NoSuchElementException`
 *   spelling so the global handler picks the right HTTP code).
 * - **Auth gate** — a blank API key short-circuits before the HTTP call (no wasted credit).
 * - **Request URL** — `symbol` and `apikey` both present.
 */
class TwelveDataSectorClassifierTest {

  private lateinit var server: MockWebServer
  private lateinit var client: TwelveDataSectorClassifier

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
    client =
      TwelveDataSectorClassifier(
        rest = RestClient.builder().build(),
        appConfig = mockAppConfig(FAKE_API_KEY),
        baseUrl = server.url("/").toString().trimEnd('/'),
      )
  }

  @AfterEach
  fun tearDown() {
    server.shutdown()
  }

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `parses Technology sector and resolves to XLK`() {
    server.enqueue(jsonOk(VALID_AAPL_BODY))

    val result = client.classify("AAPL")

    assertEquals("Technology", result.sector)
    assertEquals("XLK", result.etfSymbol)
    assertEquals("Technology Select Sector SPDR Fund", result.etfName)
  }

  @Test
  fun `requests profile with symbol and apikey`() {
    server.enqueue(jsonOk(VALID_AAPL_BODY))
    client.classify("AAPL")

    val req = server.takeRequest()
    val path = req.path ?: ""
    assertTrue(path.startsWith("/profile"))
    assertTrue(path.contains("symbol=AAPL"))
    assertTrue(path.contains("apikey=$FAKE_API_KEY"))
  }

  @Test
  fun `synonym sector label still resolves via SpdrSectorEtfs`() {
    // Twelve Data's documented label is "Technology" but the synonym table accepts the longer
    // GICS form too — pin that the integration delegates correctly to the resolver.
    server.enqueue(jsonOk(VALID_BODY_WITH_SYNONYM))

    val result = client.classify("AAPL")

    assertEquals("Technology", result.sector) // canonical label, not the synonym
    assertEquals("XLK", result.etfSymbol)
  }

  // ---------------------------------------------------------------------- 404 paths

  @Test
  fun `sector outside the SPDR mapping raises NoSuchElementException`() {
    // "Conglomerates" is a real GICS legacy label but no SPDR ETF tracks it — refusing to guess is
    // the right call (an arbitrary fallback would mislead the user).
    server.enqueue(jsonOk(BODY_WITH_UNMAPPED_SECTOR))

    val ex = assertThrows<NoSuchElementException> { client.classify("XYZ") }
    assertTrue(ex.message?.contains("XYZ") ?: false)
    assertTrue(ex.message?.contains("Conglomerates") ?: false)
  }

  @Test
  fun `missing sector field raises NoSuchElementException`() {
    // Twelve Data sometimes returns a profile with `sector: null` for ADRs / ETFs / weird
    // instruments. Same outcome as an unmapped sector — 404, no benchmark available.
    server.enqueue(jsonOk(BODY_WITHOUT_SECTOR))

    assertThrows<NoSuchElementException> { client.classify("XYZ") }
  }

  @Test
  fun `status=error code=404 raises NoSuchElementException`() {
    // Symbol unknown to Twelve Data — not a 503, not our fault. Surface as 404 so the front shows
    // "ticker not found" rather than the generic 503 retry message.
    server.enqueue(jsonOk(ERROR_404_BODY))

    val ex = assertThrows<NoSuchElementException> { client.classify("XXXX") }
    assertTrue(ex.message?.contains("XXXX") ?: false)
  }

  // ---------------------------------------------------------------------- 503 paths

  @Test
  fun `status=error code=429 raises MarketUnavailableException with rate-limited`() {
    server.enqueue(jsonOk(ERROR_429_BODY))

    val ex = assertThrows<MarketUnavailableException> { client.classify("AAPL") }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `status=error code=401 raises MarketUnavailableException with auth-failed`() {
    server.enqueue(jsonOk(ERROR_401_BODY))

    val ex = assertThrows<MarketUnavailableException> { client.classify("AAPL") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `HTTP 429 raises MarketUnavailableException with rate-limited`() {
    server.enqueue(MockResponse().setResponseCode(429).setBody(""))

    val ex = assertThrows<MarketUnavailableException> { client.classify("AAPL") }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `blank api key short-circuits before the HTTP call`() {
    val noKey =
      TwelveDataSectorClassifier(
        rest = RestClient.builder().build(),
        appConfig = mockAppConfig(""),
        baseUrl = server.url("/").toString().trimEnd('/'),
      )

    val ex = assertThrows<MarketUnavailableException> { noKey.classify("AAPL") }
    assertTrue(ex.message?.contains("API key") ?: false)
    assertEquals(0, server.requestCount)
  }

  // ---------------------------------------------------------------------- helpers + fixtures

  private fun mockAppConfig(apiKey: String): AppConfigService = mock {
    on { getString(ConfigKeys.TWELVEDATA_API_KEY) } doReturn apiKey
  }

  private fun jsonOk(body: String): MockResponse =
    MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)

  private val FAKE_API_KEY = "test-key-1234"

  private val VALID_AAPL_BODY =
    """
    {
      "symbol": "AAPL",
      "name": "Apple Inc",
      "sector": "Technology",
      "industry": "Consumer Electronics"
    }
    """
      .trimIndent()

  private val VALID_BODY_WITH_SYNONYM =
    """
    {
      "symbol": "AAPL",
      "name": "Apple Inc",
      "sector": "Information Technology",
      "industry": "Consumer Electronics"
    }
    """
      .trimIndent()

  private val BODY_WITH_UNMAPPED_SECTOR =
    """
    {
      "symbol": "XYZ",
      "name": "XYZ Corp",
      "sector": "Conglomerates",
      "industry": "Diversified"
    }
    """
      .trimIndent()

  private val BODY_WITHOUT_SECTOR =
    """
    {
      "symbol": "XYZ",
      "name": "XYZ ETF",
      "sector": null,
      "industry": null
    }
    """
      .trimIndent()

  private val ERROR_404_BODY = """{"code": 404, "message": "Symbol not found", "status": "error"}"""

  private val ERROR_429_BODY =
    """{"code": 429, "message": "API credits limit reached", "status": "error"}"""

  private val ERROR_401_BODY = """{"code": 401, "message": "Invalid API key", "status": "error"}"""
}
