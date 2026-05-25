package com.portfolioai.analyst.infrastructure.analyst

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.shared.UpstreamUnavailableException
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
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
 * Tests on [FinnhubAnalystClient] — verifies the HTTP behaviour against a local [MockWebServer]
 * rather than the real `finnhub.io`. Same rationale as
 * [com.portfolioai.news.infrastructure.news.FinnhubClientTest] and
 * [com.portfolioai.earnings.infrastructure.earnings.FinnhubEarningsClientTest] : keep the suite
 * deterministic and free from quota burn.
 *
 * What we pin :
 * - **Happy path** — a 200 with the recommendation array + a 200 price-target payload merge into a
 *   snapshot with both halves populated. The mapper layer handles the actual sort / consensus
 *   derivation (covered in [FinnhubAnalystMappersTest]) ; this test verifies the wire round-trip.
 * - **Symbol normalisation** — lowercase input round-trips as uppercase in the URL of *both*
 *   endpoints (matches the dossier convention).
 * - **Price-target fail-soft** — `/stock/price-target` is gated behind paid plans on some Finnhub
 *   accounts. The adapter swallows 401/403/5xx into a `null` price target rather than failing the
 *   whole fetch — the recommendation breakdown is still useful on its own.
 * - **Error mapping on `/stock/recommendation`** (the *required* call, no fail-soft) — 401/403 →
 *   `auth-failed`, 429 → `rate-limited`, 5xx → `upstream`. All surface as
 *   [UpstreamUnavailableException] shared with the rest of the Finnhub stack so the front shows a
 *   unified 503.
 * - **Empty recommendation array → 404** — Finnhub returns `200 []` for tickers it doesn't cover.
 *   The mapper raises [NoSuchElementException] which the global handler turns into HTTP 404,
 *   distinct from the 503 for upstream failures. We pin the wire-to-mapper hand-off here.
 * - **Blank API key** — short-circuits before any HTTP call.
 */
class FinnhubAnalystClientTest {

  private lateinit var server: MockWebServer
  private lateinit var client: FinnhubAnalystClient

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
    client =
      FinnhubAnalystClient(
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
  fun `merges recommendations and price target into a single snapshot`() {
    server.enqueue(jsonOk(RECOMMENDATIONS_NEWEST_FIRST))
    server.enqueue(jsonOk(PRICE_TARGET_POPULATED))

    val out = client.fetch("AAPL")

    // Head row picked from the most recent period (mapper sorts defensively — see
    // FinnhubAnalystMappersTest). The breakdown counts come from that head, not the wire order.
    assertEquals("AAPL", out.symbol)
    assertEquals(7, out.strongBuy)
    assertEquals(5, out.buy)
    assertEquals(3, out.hold)
    assertEquals(1, out.sell)
    assertEquals(0, out.strongSell)
    // History sorted oldest-first in the output even though Finnhub ships newest-first.
    assertEquals(2, out.history.size)
    assertEquals("2026-03-01", out.history.first().period.toString())
    assertEquals("2026-04-01", out.history.last().period.toString())
    // Price-target is wired through unchanged.
    assertNotNull(out.priceTarget)
    assertEquals(41, out.priceTarget!!.numberOfAnalysts)
  }

  @Test
  fun `lowercases input is uppercased in both URL paths and on the snapshot`() {
    // The dossier convention is uppercase symbols ; the front passes whatever's in the URL,
    // we normalise on the client boundary. Both endpoints get the uppercased value.
    server.enqueue(jsonOk(RECOMMENDATIONS_NEWEST_FIRST))
    server.enqueue(jsonOk(PRICE_TARGET_POPULATED))

    val out = client.fetch("aapl")

    val recommendationsRequest = server.takeRequest()
    val priceTargetRequest = server.takeRequest()
    assertTrue(recommendationsRequest.path?.contains("symbol=AAPL") ?: false)
    assertTrue(priceTargetRequest.path?.contains("symbol=AAPL") ?: false)
    assertEquals("AAPL", out.symbol)
  }

  @Test
  fun `both URLs carry the api token`() {
    // Auth is by query param (Finnhub convention), read per-call from AppConfigService so a key
    // rotation in /settings/configuration takes effect immediately.
    server.enqueue(jsonOk(RECOMMENDATIONS_NEWEST_FIRST))
    server.enqueue(jsonOk(PRICE_TARGET_POPULATED))

    client.fetch("AAPL")

    val recommendationsPath = server.takeRequest().path ?: ""
    val priceTargetPath = server.takeRequest().path ?: ""
    assertTrue(
      recommendationsPath.contains("token=$FAKE_KEY"),
      "Missing token on recommendations: $recommendationsPath",
    )
    assertTrue(
      priceTargetPath.contains("token=$FAKE_KEY"),
      "Missing token on price-target: $priceTargetPath",
    )
  }

  // ---------------------------------------------------------------------- price-target fail-soft

  @Test
  fun `swallows a 401 on the price-target endpoint and surfaces a snapshot without target`() {
    // Finnhub /stock/price-target is documented free tier but returns 401 in practice on some
    // accounts. The adapter must keep the recommendation breakdown rather than failing the whole
    // fetch — the dossier degrades gracefully (no target line, breakdown bar still rendered).
    server.enqueue(jsonOk(RECOMMENDATIONS_NEWEST_FIRST))
    server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Plan-restricted"}"""))

    val out = client.fetch("AAPL")

    assertNull(out.priceTarget)
    // 4xx is treated as permanent (paid-tier gate, unknown symbol) — front renders « pas
    // d'objectif », no retry hint. Distinct from 5xx / network where the flag flips to `true`.
    assertFalse(out.priceTargetUnavailable)
    assertEquals(2, out.history.size) // recommendations still present
    assertEquals(7, out.strongBuy)
  }

  @Test
  fun `swallows a 5xx on the price-target endpoint and flags it as transiently unavailable`() {
    // Server-side errors on the optional endpoint are absorbed — better degrade than fail. The
    // `priceTargetUnavailable=true` flag lets the front render « temporairement indisponible » so
    // the user knows a retry on the next refresh is meaningful. Logged at warn so the operator
    // notices.
    //
    // **Not tested separately** : the `ResourceAccessException` branch (network / timeout) is the
    // 3rd path that also sets `unavailable=true`, but simulating a network failure
    // deterministically
    // via MockWebServer is fragile (SocketPolicy.DISCONNECT_AT_START interacts poorly with JDK
    // HttpClient connection pooling). The catch block is 4 lines mirroring this one — no logic to
    // protect, same outcome on the DTO. Maps the same way through `toAnalystSnapshot`.
    server.enqueue(jsonOk(RECOMMENDATIONS_NEWEST_FIRST))
    server.enqueue(MockResponse().setResponseCode(503).setBody("upstream blip"))

    val out = client.fetch("AAPL")

    assertNull(out.priceTarget)
    assertTrue(out.priceTargetUnavailable)
    assertEquals(2, out.history.size)
  }

  // ------------------------------------------------- error mapping (recommendations, required)

  @Test
  fun `maps 401 on recommendations to UpstreamUnavailableException with auth-failed`() {
    // Auth failure on the *required* recommendation endpoint cannot be absorbed — the snapshot
    // would be empty. Surface as 503 unified with the rest of the Finnhub stack so the front
    // shows a single "service indisponible" rather than three distinct error UIs.
    server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Invalid API key"}"""))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetch("AAPL") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps 403 on recommendations to UpstreamUnavailableException with auth-failed`() {
    // 403 is what Finnhub returns when the endpoint exists but is gated behind a paid plan.
    // Treated identically to 401 here ; the diagnostic distinction is only useful in the logs.
    server.enqueue(MockResponse().setResponseCode(403).setBody("""{"error":"Forbidden"}"""))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetch("AAPL") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps 429 on recommendations to UpstreamUnavailableException with rate-limited`() {
    server.enqueue(MockResponse().setResponseCode(429).setBody(""))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetch("AAPL") }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `maps 500 on recommendations to UpstreamUnavailableException with upstream`() {
    server.enqueue(MockResponse().setResponseCode(500).setBody("internal error"))

    val ex = assertThrows<UpstreamUnavailableException> { client.fetch("AAPL") }
    assertTrue(ex.message?.contains("upstream") ?: false)
  }

  // ---------------------------------------------------------------------- guards + empty coverage

  @Test
  fun `raises a clear error when the api key is blank`() {
    // Short-circuits before the HTTP call — a misconfigured environment shouldn't waste a
    // network round-trip and the error message points at the config key to set.
    val noKey =
      FinnhubAnalystClient(
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
  fun `empty recommendation array bubbles NoSuchElementException via the mapper`() {
    // Finnhub returns `200 []` for tickers it doesn't cover — distinct from a 503 for upstream
    // failures. The mapper raises NoSuchElementException, the global handler maps to HTTP 404,
    // and the front renders a "no analyst coverage" empty state. We pin the wire-to-mapper
    // hand-off here ; the mapper-side throw is also covered in FinnhubAnalystMappersTest.
    server.enqueue(jsonOk("[]"))
    server.enqueue(jsonOk(PRICE_TARGET_POPULATED))

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
   * Two monthly snapshots intentionally listed newest-first to verify our defensive sort works.
   * Real Finnhub returns them in this order ; we test the contract independently.
   */
  private val RECOMMENDATIONS_NEWEST_FIRST =
    """
    [
      {"symbol": "AAPL", "period": "2026-04-01",
       "strongBuy": 7, "buy": 5, "hold": 3, "sell": 1, "strongSell": 0},
      {"symbol": "AAPL", "period": "2026-03-01",
       "strongBuy": 6, "buy": 4, "hold": 3, "sell": 1, "strongSell": 1}
    ]
    """
      .trimIndent()

  private val PRICE_TARGET_POPULATED =
    """
    {
      "symbol": "AAPL",
      "targetHigh": 280.00,
      "targetLow": 175.00,
      "targetMean": 235.50,
      "targetMedian": 240.00,
      "numberOfAnalysts": 41
    }
    """
      .trimIndent()
}
