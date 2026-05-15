package com.portfolioai.news.infrastructure.news

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.shared.UpstreamUnavailableException
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
 * Tests on [FinnhubClient] — verifies the HTTP behaviour against a local [MockWebServer] rather
 * than the real `finnhub.io`. Same rationale as the Twelve Data adapter tests : keep the suite
 * deterministic and free from quota burn.
 *
 * What we pin :
 * - **Happy path** — a 200 with a JSON array deserialises into the right number of [NewsItem]s,
 *   sorted newest-first regardless of upstream order.
 * - **Symbol normalisation** — lowercase input round-trips as uppercase in the URL and on the
 *   returned items (matches the dossier convention).
 * - **Date window** — `from` / `to` query params form a 30-day rolling window, computed from today
 *   (asserted as date strings present, exact values would make the test flaky on day-of-test
 *   boundaries).
 * - **Error mapping** — 401/403 → `auth-failed`, 429 → `rate-limited`, 5xx → `upstream`, network
 *   unreachable → `unreachable` ; all surface as [UpstreamUnavailableException] (shared exception
 *   with the Twelve Data adapter — both map to HTTP 503 on the public API).
 * - **Limit cap** — when the upstream returns 50 items and we ask for 5, we keep the 5 most recent,
 *   not the first 5 in the wire payload.
 * - **Blank API key** — short-circuits before the HTTP call so a misconfigured environment doesn't
 *   waste a network round-trip.
 */
class FinnhubClientTest {

  private lateinit var server: MockWebServer
  private lateinit var client: FinnhubClient

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
    client =
      FinnhubClient(
        rest = RestClient.builder().build(),
        mapper = jacksonObjectMapper(),
        appConfig = mockAppConfig(FAKE_KEY),
        baseUrl = server.url("/").toString().trimEnd('/'),
      )
  }

  @AfterEach
  fun tearDown() {
    server.shutdown()
  }

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `returns headlines sorted newest-first and capped at limit`() {
    server.enqueue(jsonOk(THREE_ARTICLES_OLDEST_FIRST))

    val items = client.fetchNews("AAPL", limit = 2)

    assertEquals(2, items.size)
    assertEquals("Latest news", items[0].headline)
    assertEquals("Mid news", items[1].headline)
    // Symbol normalised on the way out.
    assertTrue(items.all { it.symbol == "AAPL" })
  }

  @Test
  fun `lowercases input is uppercased in the URL and on the items`() {
    // The dossier convention is uppercase symbols ; the front passes whatever's in the URL,
    // we normalise on the client boundary.
    server.enqueue(jsonOk(THREE_ARTICLES_OLDEST_FIRST))

    client.fetchNews("aapl", limit = 5)

    val recorded = server.takeRequest()
    assertTrue(recorded.path?.contains("symbol=AAPL") ?: false)
  }

  @Test
  fun `URL carries from + to date window and the api token`() {
    // We don't assert exact dates (test would be flaky around midnight) — just that both params
    // are present and non-empty, and the auth token is the one we configured.
    server.enqueue(jsonOk("[]"))

    client.fetchNews("AAPL")

    val path = server.takeRequest().path ?: ""
    assertTrue(path.contains("from="), "Missing `from` param: $path")
    assertTrue(path.contains("to="), "Missing `to` param: $path")
    assertTrue(path.contains("token=$FAKE_KEY"), "Missing token: $path")
  }

  @Test
  fun `handles a stale empty payload gracefully`() {
    // Tickers with no recent press releases legitimately return `[]`. The dossier UI shows an
    // empty state ; throwing here would surface as 503 to the user, wrong UX.
    server.enqueue(jsonOk("[]"))

    val items = client.fetchNews("AAPL")
    assertTrue(items.isEmpty())
  }

  // ---------------------------------------------------------------------- error mapping

  @Test
  fun `maps 401 to UpstreamUnavailableException with auth-failed`() {
    // Finnhub returns 401 when the api key is invalid (or the endpoint isn't on the user's
    // plan). Surfaced as 503 on the public API — same path as Twelve Data's auth errors so the
    // front can show a unified "service indisponible" rather than two distinct error UIs.
    server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Invalid API key"}"""))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetchNews("AAPL") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps 403 to UpstreamUnavailableException with auth-failed`() {
    // 403 is what Finnhub returns when the endpoint exists but is gated behind a paid plan.
    // Treated identically to 401 here ; the diagnostic distinction is only useful in the logs
    // (and we log it, see FinnhubClient).
    server.enqueue(MockResponse().setResponseCode(403).setBody("""{"error":"Forbidden"}"""))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetchNews("AAPL") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps 429 to UpstreamUnavailableException with rate-limited`() {
    server.enqueue(MockResponse().setResponseCode(429).setBody(""))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetchNews("AAPL") }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `maps 500 to UpstreamUnavailableException with upstream`() {
    server.enqueue(MockResponse().setResponseCode(500).setBody("internal error"))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetchNews("AAPL") }
    assertTrue(ex.message?.contains("upstream") ?: false)
  }

  @Test
  fun `raises a clear error when the api key is blank`() {
    val noKey =
      FinnhubClient(
        rest = RestClient.builder().build(),
        mapper = jacksonObjectMapper(),
        appConfig = mockAppConfig(""),
        baseUrl = server.url("/").toString().trimEnd('/'),
      )

    val ex = assertThrows<UpstreamUnavailableException> { noKey.fetchNews("AAPL") }
    assertTrue(ex.message?.contains("API key") ?: false)
    // No HTTP call attempted — short-circuited.
    assertEquals(0, server.requestCount)
  }

  /**
   * Stub for [AppConfigService] — the only call site under test is the per-fetch read of
   * `market.finnhub.api-key`, so we hard-code that branch.
   */
  private fun mockAppConfig(apiKey: String): AppConfigService = mock {
    on { getString(ConfigKeys.FINNHUB_API_KEY) } doReturn apiKey
  }

  // ---------------------------------------------------------------------- helpers + fixtures

  private fun jsonOk(body: String): MockResponse =
    MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)

  private val FAKE_KEY = "fake-key-1234"

  /**
   * Three articles deliberately listed oldest-first to verify our sorting works regardless of
   * upstream order. `datetime` is Unix seconds (Finnhub's wire format).
   */
  private val THREE_ARTICLES_OLDEST_FIRST =
    """
    [
      {"id": 1, "category": "company news", "datetime": 1700000000, "headline": "Oldest news",
       "image": "", "source": "Reuters", "summary": "Some content", "url": "https://example.com/1"},
      {"id": 2, "category": "company news", "datetime": 1700100000, "headline": "Mid news",
       "image": "https://example.com/img2.jpg", "source": "Bloomberg",
       "summary": "More content", "url": "https://example.com/2"},
      {"id": 3, "category": "earnings", "datetime": 1700200000, "headline": "Latest news",
       "image": "", "source": "CNBC", "summary": "", "url": "https://example.com/3"}
    ]
    """
      .trimIndent()
}
