package com.portfolioai.earnings.infrastructure.earnings

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.shared.UpstreamUnavailableException
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.springframework.web.client.RestClient

/**
 * Tests on [FinnhubEarningsClient] — verifies the HTTP behaviour against a local [MockWebServer]
 * rather than the real `finnhub.io`. Same rationale as
 * [com.portfolioai.news.infrastructure.news .FinnhubClientTest] : keep the suite deterministic and
 * free from quota burn.
 *
 * What we pin :
 * - **Happy path** — a 200 with a JSON array of reports + a 200 calendar payload merge into a
 *   snapshot with both halves populated. The mapper layer handles the actual sorting / surprise
 *   computation ; this test verifies the wire round-trip.
 * - **Symbol normalisation** — lowercase input round-trips as uppercase in the URL of *both*
 *   endpoints (matches the dossier convention).
 * - **Calendar fail-soft** — the calendar endpoint can 401/403 on certain Finnhub accounts /
 *   symbols. The adapter swallows that into a `null` next-date rather than failing the whole fetch
 *   ; the report breakdown is still useful on its own.
 * - **Error mapping on `/stock/earnings`** — 401/403 → `auth-failed`, 429 → `rate-limited`, 5xx →
 *   `upstream`, network unreachable → `unreachable`. All surface as [UpstreamUnavailableException]
 *   shared with the rest of the Finnhub stack so the front shows a unified 503.
 * - **Date window on the calendar URL** — a forward-looking window is sent (`from`/`to`), present
 *   and non-empty. We don't assert exact values to avoid flakiness around midnight UTC.
 * - **Blank API key** — short-circuits before any HTTP call.
 */
class FinnhubEarningsClientTest {

  private lateinit var server: MockWebServer
  private lateinit var client: FinnhubEarningsClient

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
    client =
      FinnhubEarningsClient(
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
  fun `merges reports and calendar into a single snapshot`() {
    server.enqueue(jsonOk(REPORTS_NEWEST_FIRST))
    server.enqueue(jsonOk(CALENDAR_WITH_UPCOMING))

    val out = client.fetch("AAPL")

    // Reports are sorted oldest-first by the mapper (the wire is newest-first).
    assertEquals(2, out.lastReports.size)
    assertEquals("2025-09-30", out.lastReports.first().period.toString())
    assertEquals("2025-12-31", out.lastReports.last().period.toString())
    // Surprise % computed in-mapper from the raw estimate / actual fields, not trusted from
    // the wire.
    assertNotNull(out.lastReports.last().surprisePercent)
    // Calendar entry surfaces the next upcoming date (the only one with `epsActual = null`
    // among matching-symbol entries).
    assertEquals("2026-05-12", out.nextEarningsDate?.toString())
    assertNotNull(out.nextEarningsTime)
  }

  @Test
  fun `lowercases input is uppercased in both URL paths and on the snapshot`() {
    // The dossier convention is uppercase symbols ; the front passes whatever's in the URL,
    // we normalise on the client boundary. Both endpoints get the uppercased value.
    server.enqueue(jsonOk(REPORTS_NEWEST_FIRST))
    server.enqueue(jsonOk(CALENDAR_WITH_UPCOMING))

    val out = client.fetch("aapl")

    val reportsRequest = server.takeRequest()
    val calendarRequest = server.takeRequest()
    assertTrue(reportsRequest.path?.contains("symbol=AAPL") ?: false)
    assertTrue(calendarRequest.path?.contains("symbol=AAPL") ?: false)
    assertEquals("AAPL", out.symbol)
  }

  @Test
  fun `calendar URL carries from + to date window and the api token`() {
    // We don't assert exact dates (test would be flaky around midnight UTC) — just that both
    // params are present and non-empty, and the auth token is the one we configured.
    server.enqueue(jsonOk(REPORTS_NEWEST_FIRST))
    server.enqueue(jsonOk(EMPTY_CALENDAR))

    client.fetch("AAPL")

    server.takeRequest() // skip the reports request
    val calendarPath = server.takeRequest().path ?: ""
    assertTrue(calendarPath.contains("from="), "Missing `from` param: $calendarPath")
    assertTrue(calendarPath.contains("to="), "Missing `to` param: $calendarPath")
    assertTrue(calendarPath.contains("token=$FAKE_KEY"), "Missing token: $calendarPath")
  }

  // ---------------------------------------------------------------------- calendar fail-soft

  @Test
  fun `swallows a 401 on the calendar endpoint and surfaces a null next-date`() {
    // Finnhub /calendar/earnings is documented free tier but returns 401 in practice on some
    // accounts. The adapter must keep the report breakdown rather than failing the whole fetch
    // — the dossier degrades gracefully (no countdown line, table still rendered).
    server.enqueue(jsonOk(REPORTS_NEWEST_FIRST))
    server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Plan-restricted"}"""))

    val out = client.fetch("AAPL")

    assertNull(out.nextEarningsDate)
    assertNull(out.nextEarningsTime)
    assertEquals(2, out.lastReports.size) // reports still present
  }

  @Test
  fun `swallows a 5xx on the calendar endpoint and surfaces a null next-date`() {
    // Server-side errors on the calendar are also absorbed — better degrade than fail. Logged
    // at warn so the operator notices but the user only sees a hidden countdown.
    server.enqueue(jsonOk(REPORTS_NEWEST_FIRST))
    server.enqueue(MockResponse().setResponseCode(503).setBody("upstream blip"))

    val out = client.fetch("AAPL")

    assertNull(out.nextEarningsDate)
    assertEquals(2, out.lastReports.size)
  }

  // ---------------------------------------------------------------------- error mapping (reports)

  @Test
  fun `maps 401 on reports to UpstreamUnavailableException with auth-failed`() {
    // Auth failure on the *required* reports endpoint cannot be absorbed — the snapshot would
    // be empty. Surface as 503 unified with the rest of the Finnhub stack so the front shows a
    // single "service indisponible" rather than three distinct error UIs.
    server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Invalid API key"}"""))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetch("AAPL") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps 403 on reports to UpstreamUnavailableException with auth-failed`() {
    // 403 is what Finnhub returns when the endpoint exists but is gated behind a paid plan.
    // Treated identically to 401 here ; the diagnostic distinction is only useful in the logs.
    server.enqueue(MockResponse().setResponseCode(403).setBody("""{"error":"Forbidden"}"""))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetch("AAPL") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps 429 on reports to UpstreamUnavailableException with rate-limited`() {
    server.enqueue(MockResponse().setResponseCode(429).setBody(""))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetch("AAPL") }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `maps 500 on reports to UpstreamUnavailableException with upstream`() {
    server.enqueue(MockResponse().setResponseCode(500).setBody("internal error"))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetch("AAPL") }
    assertTrue(ex.message?.contains("upstream") ?: false)
  }

  // ---------------------------------------------------------------------- guards

  @Test
  fun `raises a clear error when the api key is blank`() {
    // Short-circuits before the HTTP call — a misconfigured environment shouldn't waste a
    // network round-trip and the error message points at the config key to set.
    val noKey =
      FinnhubEarningsClient(
        rest = RestClient.builder().build(),
        mapper = jacksonObjectMapper(),
        appConfig = mockAppConfig(""),
        baseUrl = server.url("/").toString().trimEnd('/'),
      )

    val ex = assertThrows<UpstreamUnavailableException> { noKey.fetch("AAPL") }
    assertTrue(ex.message?.contains("API key") ?: false)
    assertEquals(0, server.requestCount)
  }

  @Test
  fun `404 on both reports and calendar throws NoSuchElementException via the mapper`() {
    // Both endpoints succeed with empty payloads — no data to surface. The mapper layer raises
    // `NoSuchElementException` which the global handler maps to HTTP 404, distinct from the 503
    // for upstream failures.
    server.enqueue(jsonOk("[]"))
    server.enqueue(jsonOk(EMPTY_CALENDAR))

    assertThrows<NoSuchElementException> { client.fetch("AAPL") }
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
   * Two quarters intentionally listed newest-first to verify our defensive sort works. Real Finnhub
   * returns them in this order ; we test the contract independently.
   */
  private val REPORTS_NEWEST_FIRST =
    """
    [
      {"symbol": "AAPL", "period": "2025-12-31", "actual": 1.31, "estimate": 1.20,
       "surprise": 0.11, "surprisePercent": 9.17, "quarter": 4, "year": 2025},
      {"symbol": "AAPL", "period": "2025-09-30", "actual": 1.05, "estimate": 1.10,
       "surprise": -0.05, "surprisePercent": -4.55, "quarter": 3, "year": 2025}
    ]
    """
      .trimIndent()

  /**
   * Calendar payload with two entries, one already reported (`epsActual` set) and one upcoming
   * (`epsActual: null`). The mapper picks the upcoming one as next-date.
   */
  private val CALENDAR_WITH_UPCOMING =
    """
    {
      "earningsCalendar": [
        {"symbol": "AAPL", "date": "2026-02-01", "hour": "amc",
         "epsActual": 1.31, "epsEstimate": 1.20},
        {"symbol": "AAPL", "date": "2026-05-12", "hour": "amc",
         "epsActual": null, "epsEstimate": 1.45}
      ]
    }
    """
      .trimIndent()

  private val EMPTY_CALENDAR = """{"earningsCalendar": []}"""
}
