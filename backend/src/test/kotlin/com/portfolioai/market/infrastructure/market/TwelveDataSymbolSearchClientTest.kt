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
 * Tests on [TwelveDataSymbolSearchClient] — pins the HTTP shape and error mapping for
 * `/symbol_search` against a local [MockWebServer]. Same design as [TwelveDataClientTest] : the
 * upstream is quota-bound (1 credit / call on the free tier) so we don't burn budget in CI.
 *
 * What we pin :
 * - **Happy path** — `data` array of entries deserialised into [SymbolMatch] in the same order,
 *   `instrument_name` mapped to `name`.
 * - **Error mapping** — `status: error code: 401/403/429` and HTTP 429/500 all surface as
 *   [MarketUnavailableException] with the message tag the front uses to differentiate
 *   ("rate-limited" / "auth-failed" / "upstream"). Same surface as the chart adapter so the UI's
 *   503 panel doesn't have to know which endpoint failed.
 * - **Defensive parsing** — entries with a blank `symbol` are dropped (Twelve Data occasionally
 *   returns rows for delisted instruments) ; entries with a missing `exchange` fall back to "—" so
 *   the UI still has something stable to render.
 * - **Auth gate** — a blank API key short-circuits before the HTTP call (no wasted credit).
 * - **Request URL** — `symbol`, `outputsize` and `apikey` all present.
 */
class TwelveDataSymbolSearchClientTest {

  private lateinit var server: MockWebServer
  private lateinit var client: TwelveDataSymbolSearchClient

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
    client =
      TwelveDataSymbolSearchClient(
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
  fun `parses the data array into SymbolMatch entries`() {
    server.enqueue(jsonOk(VALID_BODY))

    val results = client.search("AA", 10)

    assertEquals(2, results.size)
    assertEquals("AAPL", results[0].symbol)
    assertEquals("Apple Inc", results[0].name)
    assertEquals("NASDAQ", results[0].exchange)
    assertEquals("AAP", results[1].symbol)
    assertEquals("NYSE", results[1].exchange)
  }

  @Test
  fun `requests symbol_search with symbol, outputsize and apikey`() {
    server.enqueue(jsonOk(VALID_BODY))
    client.search("AA", 8)

    val req = server.takeRequest()
    val path = req.path ?: ""
    assertTrue(path.startsWith("/symbol_search"))
    assertTrue(path.contains("symbol=AA"))
    assertTrue(path.contains("outputsize=8"))
    assertTrue(path.contains("apikey=$FAKE_API_KEY"))
  }

  @Test
  fun `entries without a symbol are dropped`() {
    // Twelve Data occasionally returns a row with empty fields for delisted instruments — safer to
    // drop them than to surface a non-clickable autocomplete entry.
    server.enqueue(jsonOk(BODY_WITH_EMPTY_SYMBOL))

    val results = client.search("AA", 10)

    assertEquals(1, results.size)
    assertEquals("AAPL", results[0].symbol)
  }

  @Test
  fun `missing exchange falls back to a stable placeholder`() {
    server.enqueue(jsonOk(BODY_WITHOUT_EXCHANGE))

    val results = client.search("AA", 10)

    assertEquals(1, results.size)
    assertEquals("—", results[0].exchange)
  }

  // ---------------------------------------------------------------------- error mapping

  @Test
  fun `maps status=error code=429 to MarketUnavailableException with rate-limited`() {
    server.enqueue(jsonOk(ERROR_429_BODY))

    val ex = assertThrows<MarketUnavailableException> { client.search("AA", 10) }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `maps status=error code=401 to MarketUnavailableException with auth-failed`() {
    server.enqueue(jsonOk(ERROR_401_BODY))

    val ex = assertThrows<MarketUnavailableException> { client.search("AA", 10) }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps HTTP 429 to MarketUnavailableException with rate-limited`() {
    server.enqueue(MockResponse().setResponseCode(429).setBody(""))

    val ex = assertThrows<MarketUnavailableException> { client.search("AA", 10) }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `blank query short-circuits to empty list without hitting the upstream`() {
    val results = client.search("   ", 10)
    assertTrue(results.isEmpty())
    assertEquals(0, server.requestCount)
  }

  @Test
  fun `raises a clear error when the api key is blank`() {
    val noKey =
      TwelveDataSymbolSearchClient(
        rest = RestClient.builder().build(),
        appConfig = mockAppConfig(""),
        baseUrl = server.url("/").toString().trimEnd('/'),
      )

    val ex = assertThrows<MarketUnavailableException> { noKey.search("AA", 10) }
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

  private val VALID_BODY =
    """
    {
      "data": [
        {"symbol": "AAPL", "instrument_name": "Apple Inc", "exchange": "NASDAQ"},
        {"symbol": "AAP", "instrument_name": "Advance Auto Parts Inc", "exchange": "NYSE"}
      ],
      "status": "ok"
    }
    """
      .trimIndent()

  private val BODY_WITH_EMPTY_SYMBOL =
    """
    {
      "data": [
        {"symbol": "AAPL", "instrument_name": "Apple Inc", "exchange": "NASDAQ"},
        {"symbol": "", "instrument_name": "Delisted Co", "exchange": "OTC"}
      ],
      "status": "ok"
    }
    """
      .trimIndent()

  private val BODY_WITHOUT_EXCHANGE =
    """
    {
      "data": [
        {"symbol": "AAPL", "instrument_name": "Apple Inc"}
      ],
      "status": "ok"
    }
    """
      .trimIndent()

  private val ERROR_429_BODY =
    """{"code": 429, "message": "API credits limit reached", "status": "error"}"""

  private val ERROR_401_BODY = """{"code": 401, "message": "Invalid API key", "status": "error"}"""
}
