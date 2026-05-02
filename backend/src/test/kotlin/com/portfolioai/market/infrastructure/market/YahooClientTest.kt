package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.MarketUnavailableException
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.http.HttpClient
import java.time.Duration
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient

/**
 * Tests on [YahooClient] — verifies the HTTP behaviour against a local [MockWebServer] rather than
 * the real `query1.finance.yahoo.com`. Two reasons :
 * 1. Yahoo's undocumented endpoint is rate-limited and intermittently bans residential IPs, making
 *    any test that hits the real service flaky and a CI liability.
 * 2. We can replay specific HTTP shapes (429, 404, 5xx, 401-then-200, malformed JSON) that the real
 *    endpoint rarely emits on demand, but that the production client must handle correctly.
 *
 * What we pin down :
 * - **Happy path** : a 200 with a valid `chart` payload parses into a [YahooChartResult], with
 *   `?crumb=<token>` always appended to the URL.
 * - **Crumb refresh on 401** : the chart call retries once after invalidating [YahooSession],
 *   recovering automatically when Yahoo's session-token rotated server-side.
 * - **Error mapping** : 429 → [MarketUnavailableException] with `"rate-limited"` (drives 503 on the
 *   public API), 404 → [NoSuchElementException] (drives 404), 5xx → [MarketUnavailableException].
 * - **Yahoo-error body** : a 200 response with `"chart.error"` set is treated as failure and
 *   surfaces the upstream code/description.
 * - **Browser fingerprint headers** : the minimum set Yahoo accepts (UA Chrome, `Accept` for any
 *   media type, `Accept-Language`, `Referer` to `finance.yahoo.com`) is sent.
 *
 * The [YahooSession] is mocked via Mockito so this test focuses on the chart endpoint behaviour ;
 * the full cookie + crumb dance has its own coverage path (manual + integration when reactivating
 * Yahoo in prod).
 */
class YahooClientTest {

  private lateinit var server: MockWebServer
  private lateinit var rest: RestClient
  private lateinit var session: YahooSession
  private lateinit var client: YahooClient

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()

    // Build a RestClient that mirrors what `YahooHttpConfig` exposes, pointed at the mock server.
    // The cookie manager is needed because the production code expects a cookie-aware HttpClient ;
    // an empty cookie store is fine here since the session is mocked.
    val httpClient =
      HttpClient.newBuilder()
        .cookieHandler(CookieManager(null, CookiePolicy.ACCEPT_ALL))
        .connectTimeout(Duration.ofSeconds(5))
        .build()
    rest =
      RestClient.builder()
        .requestFactory(JdkClientHttpRequestFactory(httpClient))
        .defaultHeader(
          "User-Agent",
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        )
        .defaultHeader("Accept", "*/*")
        .defaultHeader("Accept-Language", "en-US,en;q=0.9")
        .defaultHeader("Referer", "https://finance.yahoo.com/")
        .build()

    // Mocked session — returns a fixed crumb. Tests that exercise the 401-retry branch override
    // this via `.invalidate()` verification.
    session = mock { on { getCrumb() } doReturn FAKE_CRUMB }

    client =
      YahooClient(rest = rest, session = session, baseUrl = server.url("/").toString().trimEnd('/'))
  }

  @AfterEach
  fun tearDown() {
    server.shutdown()
  }

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `parses a successful 200 chart response`() {
    server.enqueue(jsonOk(VALID_CHART_BODY))

    val result = client.fetchChart("AAPL", "1y", "1d")

    assertEquals("AAPL", result.meta.symbol)
    assertEquals("Apple Inc.", result.meta.longName)
    assertEquals(2, result.timestamp?.size)
    assertEquals(2, result.indicators?.quote?.first()?.close?.size)
  }

  @Test
  fun `sends the request with the minimum browser fingerprint headers Yahoo accepts`() {
    server.enqueue(jsonOk(VALID_CHART_BODY))

    client.fetchChart("AAPL")

    val recorded = server.takeRequest()
    // A regression on any of these silently brings the 429 fingerprint ban back. This minimum
    // set was discovered by recording what the JDK actually transmits — see audit notes.
    assertTrue(recorded.getHeader("User-Agent")?.contains("Chrome") ?: false)
    assertEquals("*/*", recorded.getHeader("Accept"))
    assertEquals("en-US,en;q=0.9", recorded.getHeader("Accept-Language"))
    assertEquals("https://finance.yahoo.com/", recorded.getHeader("Referer"))
  }

  @Test
  fun `requests the chart endpoint with range, interval and crumb in the URL`() {
    server.enqueue(jsonOk(VALID_CHART_BODY))

    client.fetchChart("AAPL", range = "1y", interval = "1d")

    val recorded = server.takeRequest()
    assertEquals("GET", recorded.method)
    // The crumb is mandatory ; without it modern Yahoo returns 401 / 429.
    assertEquals("/v8/finance/chart/AAPL?range=1y&interval=1d&crumb=$FAKE_CRUMB", recorded.path)
  }

  // ---------------------------------------------------------------------- crumb refresh

  @Test
  fun `refreshes the session and retries once when Yahoo returns 401`() {
    // Server: first response is 401 (crumb expired), second is 200 with the real payload. The
    // client should invalidate the session, fetch a fresh crumb (mocked to return the same value
    // for simplicity), and succeed transparently.
    server.enqueue(MockResponse().setResponseCode(401).setBody(""))
    server.enqueue(jsonOk(VALID_CHART_BODY))

    val result = client.fetchChart("AAPL")

    assertEquals("AAPL", result.meta.symbol)
    // The session was invalidated exactly once between the two attempts.
    verify(session, times(1)).invalidate()
    // getCrumb() called twice : once for the initial attempt, once after the invalidation.
    verify(session, times(2)).getCrumb()
    assertEquals(2, server.requestCount)
  }

  @Test
  fun `surfaces 401 as MarketUnavailableException after a single retry`() {
    // Two consecutive 401s : first triggers the retry, second exhausts it.
    server.enqueue(MockResponse().setResponseCode(401).setBody(""))
    server.enqueue(MockResponse().setResponseCode(401).setBody(""))

    val ex = assertThrows<MarketUnavailableException> { client.fetchChart("AAPL") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
    verify(session, times(1)).invalidate()
  }

  // ---------------------------------------------------------------------- error mapping

  @Test
  fun `maps 429 to MarketUnavailableException with rate-limited reason`() {
    // Yahoo's 429 is what the global handler maps to HTTP 503 for the front. The body is plain
    // text "Too Many Requests" (or sometimes a JSON snippet) — the message we throw doesn't
    // include it but YahooClient logs it for diagnosis.
    server.enqueue(MockResponse().setResponseCode(429).setBody("Too Many Requests"))

    val ex = assertThrows<MarketUnavailableException> { client.fetchChart("AAPL") }
    assertTrue(
      ex.message?.contains("rate-limited") ?: false,
      "Expected the message to mark this as a rate-limit, got '${ex.message}'",
    )
    // 429 is not a "crumb expired" signal — we should not invalidate the session for it.
    verify(session, never()).invalidate()
  }

  @Test
  fun `maps 404 to NoSuchElementException so the global handler returns 404`() {
    // 404 is a real "ticker doesn't exist on Yahoo" signal — semantically distinct from 429.
    // The mapping decides whether the front shows "Ticker introuvable" or "Données momentanément
    // indisponibles". Don't merge them.
    server.enqueue(MockResponse().setResponseCode(404).setBody(""))

    val ex = assertThrows<NoSuchElementException> { client.fetchChart("UNKNOWN") }
    assertTrue(ex.message?.contains("UNKNOWN") ?: false)
  }

  @Test
  fun `maps 500 to MarketUnavailableException as upstream error`() {
    server.enqueue(MockResponse().setResponseCode(500).setBody("internal error"))

    val ex = assertThrows<MarketUnavailableException> { client.fetchChart("AAPL") }
    assertTrue(ex.message?.contains("upstream") ?: false)
  }

  @Test
  fun `maps a 200 with chart-error body to MarketUnavailableException`() {
    // Yahoo can return 200 with `"chart": { "error": { ... } }` for certain ticker types or when
    // the request range overshoots. Treated as failure with the upstream code surfaced.
    server.enqueue(
      jsonOk(
        """{"chart": {"result": null, "error": {"code": "Not Found", "description": "No data found"}}}"""
      )
    )

    val ex = assertThrows<MarketUnavailableException> { client.fetchChart("XYZ") }
    assertTrue(ex.message?.contains("Not Found") ?: false)
  }

  @Test
  fun `maps a 200 with empty result list to NoSuchElementException`() {
    server.enqueue(jsonOk("""{"chart": {"result": [], "error": null}}"""))

    val ex = assertThrows<NoSuchElementException> { client.fetchChart("XYZ") }
    assertTrue(ex.message?.contains("XYZ") ?: false)
  }

  // ---------------------------------------------------------------------- helpers + fixtures

  /**
   * 200 response with the JSON body and the `Content-Type: application/json` header that Spring's
   * RestClient needs to pick the right `HttpMessageConverter`. MockWebServer defaults to
   * `application/octet-stream` if we don't say otherwise, which would surface as
   * `UnknownContentTypeException` instead of the parsed payload — confusing in tests.
   */
  private fun jsonOk(body: String): MockResponse =
    MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)

  /** Stable fake crumb — short, opaque, matches Yahoo's real format roughly. */
  private val FAKE_CRUMB = "iJk9XmL2.AB"

  /** Minimal valid chart payload — 2 bars, full meta, used by happy-path tests. */
  private val VALID_CHART_BODY =
    """
    {
      "chart": {
        "error": null,
        "result": [
          {
            "meta": {
              "symbol": "AAPL",
              "longName": "Apple Inc.",
              "currency": "USD",
              "fullExchangeName": "NasdaqGS",
              "regularMarketPrice": 180.0,
              "regularMarketTime": 1700086400,
              "fiftyTwoWeekHigh": 200.0,
              "fiftyTwoWeekLow": 140.0
            },
            "timestamp": [1700000000, 1700086400],
            "indicators": {
              "quote": [
                {
                  "open":   [178.0, 180.0],
                  "high":   [177.0, 179.0],
                  "low":    [176.0, 178.0],
                  "close":  [180.0, 181.0],
                  "volume": [1500000, 1800000]
                }
              ]
            }
          }
        ]
      }
    }
    """
      .trimIndent()
}
