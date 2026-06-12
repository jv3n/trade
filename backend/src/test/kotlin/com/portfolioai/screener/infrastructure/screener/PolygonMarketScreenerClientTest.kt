package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
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
 * Tests on [PolygonMarketScreenerClient] — exercises the **grouped-daily** adapter (Phase 6 v0.2
 * pivot after the snapshot endpoint turned out to require Polygon Stocks Starter, not the free
 * Basic plan). The adapter makes two HTTP calls per refresh : one for the most recent trading day,
 * one for the previous trading day, then joins by ticker symbol to compute the gap %.
 *
 * What we pin :
 * - **Happy path** : two non-empty grouped payloads → joined into `TickerMover` rows with `gapPct =
 *   (t1.c - t0.c) / t0.c * 100`, `volumeRatio = t1.v / t0.v`.
 * - **Calendar walk-back** : if the first probe (today) returns no results (weekend / holiday /
 *   pre-EOD-commit), the adapter walks back one day at a time until it finds a trading day.
 * - **Skip rule** : tickers present on the recent day but absent on the previous day (recently
 *   IPO'd or symbol changed) are skipped — no NaN in the pipeline.
 * - **Exhausted lookback** : when 6 consecutive days yield empty results,
 *   `UpstreamUnavailableException` is raised with a "no trading-day bars" diagnostic.
 * - **Error mapping** : 401 → `auth-failed`, 403 → `auth-failed: plan does not allow`, 429 →
 *   `rate-limited`, 5xx → `upstream`.
 * - **Blank key short-circuit** : no HTTP call is fired, the operator sees an actionable message.
 *
 * `MockWebServer` is used rather than a live `api.massive.com` hit — free tier 5 req/min would make
 * CI flaky, and we need to inject specific shapes (empty results, error codes) the live API doesn't
 * emit on demand.
 */
class PolygonMarketScreenerClientTest {

  private lateinit var server: MockWebServer
  private lateinit var client: PolygonMarketScreenerClient

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
    client =
      PolygonMarketScreenerClient(
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
  fun `joins the two trading-day payloads into TickerMovers with computed gap and volume ratio`() {
    // The first enqueued response is the most recent trading day (today by default), the second
    // is the previous trading day. Polygon's grouped daily abbreviates `ticker` to `T`.
    server.enqueue(jsonOk(RECENT_DAY_BODY))
    server.enqueue(jsonOk(PREVIOUS_DAY_BODY))

    val movers = client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)

    assertEquals(2, movers.size)
    val nvda = movers.first { it.symbol == "NVDA" }
    assertEquals("NVDA", nvda.name) // name = T fallback (grouped daily has no name field)
    assertEquals(BigDecimal("520.00"), nvda.price)
    assertEquals(BigDecimal("500.00"), nvda.previousClose)
    // (520 - 500) / 500 * 100 = 4.00
    assertEquals(BigDecimal("4.00"), nvda.gapPct)
    assertEquals(80_000_000L, nvda.volume)
    // volumeAvg30d carries the previous day volume as a single-day proxy
    assertEquals(40_000_000L, nvda.volumeAvg30d)
    // 80M / 40M = 2.00
    assertEquals(BigDecimal("2.00"), nvda.volumeRatio)
    // Sentinels untouched by the grouped-daily endpoint
    assertEquals(0L, nvda.marketCapUsd)
    assertEquals("", nvda.exchange)
    assertEquals(null, nvda.sector)
  }

  @Test
  fun `passes the api key as the apiKey query parameter on every call`() {
    server.enqueue(jsonOk(RECENT_DAY_BODY))
    server.enqueue(jsonOk(PREVIOUS_DAY_BODY))

    client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)

    val recentRequest = server.takeRequest()
    val recentPath = recentRequest.path ?: ""
    assertTrue(recentPath.startsWith("/v2/aggs/grouped/locale/us/market/stocks/"))
    assertTrue(recentPath.contains("adjusted=true"))
    assertTrue(
      recentPath.contains("apiKey=$FAKE_API_KEY"),
      "expected apiKey query param, got '$recentPath'",
    )

    val previousRequest = server.takeRequest()
    val previousPath = previousRequest.path ?: ""
    assertTrue(previousPath.startsWith("/v2/aggs/grouped/locale/us/market/stocks/"))
    assertTrue(previousPath.contains("apiKey=$FAKE_API_KEY"))
  }

  // ---------------------------------------------------------------------- calendar walk-back

  @Test
  fun `walks back one calendar day at a time when a probe returns no results`() {
    // Simulate "called on a Sunday" : today + yesterday return empty, Friday returns data.
    server.enqueue(jsonOk(EMPTY_BODY))
    server.enqueue(jsonOk(EMPTY_BODY))
    server.enqueue(jsonOk(RECENT_DAY_BODY))
    server.enqueue(jsonOk(PREVIOUS_DAY_BODY))

    val movers = client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)

    assertEquals(2, movers.size)
    // 4 requests fired : 2 empty probes + 2 successful trading-day probes.
    assertEquals(4, server.requestCount)
  }

  @Test
  fun `raises UpstreamUnavailableException when no trading day is found in the lookback window`() {
    // Six consecutive empties exhaust the lookback and surface as a clear diagnostic.
    repeat(6) { server.enqueue(jsonOk(EMPTY_BODY)) }

    val ex =
      assertThrows<UpstreamUnavailableException> {
        client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)
      }
    assertTrue(ex.message?.contains("no trading-day bars") ?: false)
  }

  // ---------------------------------------------------------------------- skip rules

  @Test
  fun `skips tickers absent from the previous-day payload rather than carrying NaN downstream`() {
    // Recent day carries NVDA + IPO_TODAY ; previous day carries only NVDA. IPO_TODAY is dropped.
    server.enqueue(jsonOk(RECENT_WITH_NEW_LISTING_BODY))
    server.enqueue(jsonOk(PREVIOUS_DAY_BODY))

    val movers = client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)

    assertEquals(1, movers.size)
    assertEquals("NVDA", movers[0].symbol)
  }

  // ---------------------------------------------------------------------- error mapping

  @Test
  fun `maps HTTP 401 to UpstreamUnavailableException auth-failed`() {
    server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"unauthorized"}"""))

    val ex =
      assertThrows<UpstreamUnavailableException> {
        client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)
      }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps HTTP 403 to UpstreamUnavailableException auth-failed with plan hint`() {
    // 403 from Polygon means "your plan does not include this endpoint" — the radar saw this
    // live on the Basic free tier when calling the snapshot endpoint, hence the pivot. We keep
    // the explicit plan-hint message so the operator knows whether to top up or rotate a key.
    server.enqueue(MockResponse().setResponseCode(403).setBody("""{"error":"forbidden"}"""))

    val ex =
      assertThrows<UpstreamUnavailableException> {
        client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)
      }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
    assertTrue(ex.message?.contains("plan") ?: false)
  }

  @Test
  fun `maps HTTP 429 to UpstreamUnavailableException rate-limited`() {
    server.enqueue(MockResponse().setResponseCode(429))

    val ex =
      assertThrows<UpstreamUnavailableException> {
        client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)
      }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `maps HTTP 500 to UpstreamUnavailableException upstream`() {
    server.enqueue(MockResponse().setResponseCode(500).setBody("internal error"))

    val ex =
      assertThrows<UpstreamUnavailableException> {
        client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)
      }
    assertTrue(ex.message?.contains("upstream") ?: false)
  }

  // ---------------------------------------------------------------------- blank key short-circuit

  @Test
  fun `raises a clear error when the api key is blank and burns zero requests`() {
    val noKeyClient =
      PolygonMarketScreenerClient(
        rest = RestClient.builder().build(),
        appConfig = mockAppConfig(""),
        baseUrl = server.url("/").toString().trimEnd('/'),
      )

    val ex =
      assertThrows<UpstreamUnavailableException> {
        noKeyClient.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)
      }
    assertTrue(ex.message?.contains("API key") ?: false)
    assertEquals(0, server.requestCount)
  }

  // ---------------------------------------------------------------------- helpers + fixtures

  private fun mockAppConfig(apiKey: String): AppConfigService = mock {
    on { getString(ConfigKeys.POLYGON_API_KEY) } doReturn apiKey
  }

  private fun jsonOk(body: String): MockResponse =
    MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)

  private val FAKE_API_KEY = "polygon-test-key-1234"

  private val EMPTY_BODY =
    """{"status":"OK","queryCount":1,"resultsCount":0,"adjusted":true,"results":null}"""

  private val RECENT_DAY_BODY =
    """
    {
      "status": "OK",
      "queryCount": 1,
      "resultsCount": 2,
      "adjusted": true,
      "results": [
        { "T": "NVDA", "c": 520.00, "v": 80000000 },
        { "T": "MARA", "c": 22.50,  "v": 60000000 }
      ]
    }
    """
      .trimIndent()

  private val PREVIOUS_DAY_BODY =
    """
    {
      "status": "OK",
      "queryCount": 1,
      "resultsCount": 2,
      "adjusted": true,
      "results": [
        { "T": "NVDA", "c": 500.00, "v": 40000000 },
        { "T": "MARA", "c": 20.00,  "v": 10000000 }
      ]
    }
    """
      .trimIndent()

  /**
   * Recent-day payload that includes a ticker absent from the previous-day payload — exercises the
   * IPO / recent-listing skip rule.
   */
  private val RECENT_WITH_NEW_LISTING_BODY =
    """
    {
      "status": "OK",
      "queryCount": 1,
      "resultsCount": 2,
      "adjusted": true,
      "results": [
        { "T": "NVDA",      "c": 520.00, "v": 80000000 },
        { "T": "IPO_TODAY", "c": 30.00,  "v": 12000000 }
      ]
    }
    """
      .trimIndent()
}
