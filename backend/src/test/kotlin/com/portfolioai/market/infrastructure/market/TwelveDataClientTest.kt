package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.MarketUnavailableException
import java.math.BigDecimal
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.web.client.RestClient

/**
 * Tests on [TwelveDataClient] — verifies HTTP behaviour against a local [MockWebServer] rather than
 * the real `api.twelvedata.com`. Two reasons :
 * 1. Twelve Data's free tier is quota-bound (800 credits/day) ; a flaky CI test that hits the real
 *    service would burn the budget and become unreliable.
 * 2. We need to exercise specific shapes — `status: "error"` body returned with HTTP 200, missing
 *    `fifty_two_week` block, DESC vs ASC ordering — that the real API does not emit on demand.
 *
 * What we pin down :
 * - **Happy path** : two endpoints (`/time_series` + `/quote`) merged into a single [MarketChart],
 *   bars in chronological order regardless of upstream order.
 * - **Error mapping** : HTTP 200 with `status: error, code: 404` → [NoSuchElementException] ;
 *   `code: 429` → [MarketUnavailableException] with `"rate-limited"` ; HTTP 5xx → upstream error.
 * - **Auth check** : a blank `api-key` is detected before the HTTP call and raises a clear
 *   [MarketUnavailableException] — saves a wasted credit and gives the operator a useful message.
 * - **Quote fallback** : when the quote payload omits `fifty_two_week`, the mapper falls back to
 *   the min/max of the bar closes so the dossier still displays the range.
 * - **Request URL** : `apikey`, `outputsize`, `interval` and `order=ASC` all present.
 */
class TwelveDataClientTest {

  private lateinit var server: MockWebServer
  private lateinit var client: TwelveDataClient

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
    client =
      TwelveDataClient(
        rest = RestClient.builder().build(),
        baseUrl = server.url("/").toString().trimEnd('/'),
        apiKey = FAKE_API_KEY,
      )
  }

  @AfterEach
  fun tearDown() {
    server.shutdown()
  }

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `merges time_series and quote into a MarketChart`() {
    server.enqueue(jsonOk(VALID_TIME_SERIES_BODY))
    server.enqueue(jsonOk(VALID_QUOTE_BODY))

    val chart = client.fetchChart("AAPL", "1y", "1d")

    assertEquals("AAPL", chart.quote.symbol)
    assertEquals("Apple Inc.", chart.quote.name)
    assertEquals("USD", chart.quote.currency)
    assertEquals(BigDecimal("181.50"), chart.quote.price)
    assertEquals(BigDecimal("200.00"), chart.quote.fiftyTwoWeekHigh)
    assertEquals(BigDecimal("140.00"), chart.quote.fiftyTwoWeekLow)
    assertEquals(2, chart.bars.size)
    // Bars in chronological order (oldest first), even if the API returned them DESC.
    assertTrue(chart.bars[0].timestamp.isBefore(chart.bars[1].timestamp))
    assertEquals(BigDecimal("180.00"), chart.bars[0].open)
    assertEquals(1_500_000L, chart.bars[0].volume)
  }

  @Test
  fun `requests time_series with apikey, outputsize, interval and ASC order`() {
    server.enqueue(jsonOk(VALID_TIME_SERIES_BODY))
    server.enqueue(jsonOk(VALID_QUOTE_BODY))

    client.fetchChart("AAPL", "1y", "1d")

    val seriesRequest = server.takeRequest()
    val path = seriesRequest.path ?: ""
    // Each parameter is mandatory — a regression on any drops accuracy or burns a wasted credit.
    assertTrue(path.startsWith("/time_series"))
    assertTrue(path.contains("symbol=AAPL"))
    assertTrue(path.contains("interval=1day"))
    assertTrue(path.contains("outputsize=260"))
    assertTrue(path.contains("order=ASC"))
    assertTrue(path.contains("apikey=$FAKE_API_KEY"))

    val quoteRequest = server.takeRequest()
    assertTrue(quoteRequest.path?.startsWith("/quote") ?: false)
    assertTrue(quoteRequest.path?.contains("apikey=$FAKE_API_KEY") ?: false)
  }

  @Test
  fun `falls back to bar-derived 52w range when quote payload omits fifty_two_week`() {
    // Real-world case : pre-IPO and TSX small-caps return the quote without fifty_two_week. The
    // dossier should still display a range — derived from the time-series we just fetched.
    server.enqueue(jsonOk(VALID_TIME_SERIES_BODY))
    server.enqueue(jsonOk(QUOTE_NO_52W_BODY))

    val chart = client.fetchChart("SMALL", "1y", "1d")

    val closes = chart.bars.map { it.close }
    assertEquals(closes.max(), chart.quote.fiftyTwoWeekHigh)
    assertEquals(closes.min(), chart.quote.fiftyTwoWeekLow)
  }

  // ---------------------------------------------------------------------- error mapping

  @Test
  fun `maps 200 with status=error code=404 to NoSuchElementException`() {
    // Twelve Data signals "ticker not found" with HTTP 200 + body `{status:"error", code:404}`.
    // Easy to miss if you only look at the HTTP code.
    server.enqueue(jsonOk(ERROR_404_BODY))

    val ex = assertThrows<NoSuchElementException> { client.fetchChart("XXXX", "1y", "1d") }
    assertTrue(ex.message?.contains("XXXX") ?: false)
  }

  @Test
  fun `maps 200 with status=error code=429 to MarketUnavailableException with rate-limited`() {
    server.enqueue(jsonOk(ERROR_429_BODY))

    val ex = assertThrows<MarketUnavailableException> { client.fetchChart("AAPL", "1y", "1d") }
    assertTrue(
      ex.message?.contains("rate-limited") ?: false,
      "Expected the message to mark this as a rate-limit, got '${ex.message}'",
    )
  }

  @Test
  fun `maps 200 with status=error code=401 to MarketUnavailableException with auth-failed`() {
    server.enqueue(jsonOk(ERROR_401_BODY))

    val ex = assertThrows<MarketUnavailableException> { client.fetchChart("AAPL", "1y", "1d") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps HTTP 429 to MarketUnavailableException with rate-limited`() {
    // Twelve Data also enforces hard rate-limits at the HTTP layer (per-second cap on free tier).
    // Both code paths must yield the same observable error so the front behaves consistently.
    server.enqueue(MockResponse().setResponseCode(429).setBody(""))

    val ex = assertThrows<MarketUnavailableException> { client.fetchChart("AAPL", "1y", "1d") }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `maps HTTP 500 to MarketUnavailableException with upstream`() {
    server.enqueue(MockResponse().setResponseCode(500).setBody("internal error"))

    val ex = assertThrows<MarketUnavailableException> { client.fetchChart("AAPL", "1y", "1d") }
    assertTrue(ex.message?.contains("upstream") ?: false)
  }

  @Test
  fun `maps empty time_series values to NoSuchElementException`() {
    // Twelve Data sometimes returns status=ok with an empty values array (delisted symbols on the
    // free tier). Treat as "ticker not found" — same UX as a true 404.
    server.enqueue(jsonOk("""{"meta":{"symbol":"DELISTED"},"values":[],"status":"ok"}"""))

    val ex = assertThrows<NoSuchElementException> { client.fetchChart("DELISTED", "1y", "1d") }
    assertTrue(ex.message?.contains("DELISTED") ?: false)
  }

  @Test
  fun `raises a clear error when the api key is blank`() {
    // No HTTP call should be made — saves a wasted credit and gives the operator an actionable
    // message in the logs / front error panel.
    val noKeyClient =
      TwelveDataClient(
        rest = RestClient.builder().build(),
        baseUrl = server.url("/").toString().trimEnd('/'),
        apiKey = "",
      )

    val ex = assertThrows<MarketUnavailableException> { noKeyClient.fetchChart("AAPL", "1y", "1d") }
    assertTrue(ex.message?.contains("API key") ?: false)
    assertEquals(0, server.requestCount)
  }

  // ---------------------------------------------------------------------- helpers + fixtures

  /**
   * 200 response with `Content-Type: application/json`. MockWebServer defaults to
   * `application/octet-stream` otherwise, which surfaces as `UnknownContentTypeException` instead
   * of the parsed payload.
   */
  private fun jsonOk(body: String): MockResponse =
    MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)

  private val FAKE_API_KEY = "test-key-1234"

  /** Minimal valid time_series payload — 2 bars, full meta. Returned in DESC order on purpose. */
  private val VALID_TIME_SERIES_BODY =
    """
    {
      "meta": {
        "symbol": "AAPL",
        "interval": "1day",
        "currency": "USD",
        "exchange": "NASDAQ",
        "type": "Common Stock"
      },
      "values": [
        {
          "datetime": "2024-01-16",
          "open": "181.00",
          "high": "183.00",
          "low": "180.50",
          "close": "182.00",
          "volume": "1800000"
        },
        {
          "datetime": "2024-01-15",
          "open": "180.00",
          "high": "182.50",
          "low": "179.20",
          "close": "181.50",
          "volume": "1500000"
        }
      ],
      "status": "ok"
    }
    """
      .trimIndent()

  /** Minimal valid quote payload — name, currency, 52-week range, latest close. */
  private val VALID_QUOTE_BODY =
    """
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "exchange": "NASDAQ",
      "currency": "USD",
      "datetime": "2024-01-16",
      "timestamp": 1705414400,
      "close": "181.50",
      "fifty_two_week": {
        "low": "140.00",
        "high": "200.00"
      }
    }
    """
      .trimIndent()

  /** Quote without `fifty_two_week` — exercises the fallback to bar-derived range. */
  private val QUOTE_NO_52W_BODY =
    """
    {
      "symbol": "SMALL",
      "name": "Small Co",
      "exchange": "TSX",
      "currency": "CAD",
      "datetime": "2024-01-16",
      "close": "12.34"
    }
    """
      .trimIndent()

  private val ERROR_404_BODY =
    """{"code": 404, "message": "**symbol** XXXX not found", "status": "error"}"""

  private val ERROR_429_BODY =
    """{"code": 429, "message": "API credits limit reached", "status": "error"}"""

  private val ERROR_401_BODY = """{"code": 401, "message": "Invalid API key", "status": "error"}"""
}
