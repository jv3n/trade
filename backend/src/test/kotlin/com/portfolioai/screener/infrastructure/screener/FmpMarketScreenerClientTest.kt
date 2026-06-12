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
 * Tests on [FmpMarketScreenerClient] — exercises the gainers + losers merger against a local
 * [MockWebServer] rather than the live `financialmodelingprep.com`. The free-tier 250 req/day
 * ceiling would make live CI hits flaky, and we need to inject specific shapes (empty arrays,
 * missing fields, error codes) the live API doesn't emit on demand.
 *
 * What we pin :
 * - **Happy path** : two non-empty arrays (gainers + losers) merged into a `TickerMover` list, with
 *   `gapPct = changesPercentage`, `previousClose = price - change`, and the volume-related fields
 *   all zeroed out (documented limitation — FMP gainers/losers doesn't expose volume).
 * - **Name + exchange carried through** : FMP's payload populates these unlike Polygon, so the
 *   adapter should not fall back to symbol for `name` or empty for `exchange`.
 * - **Skip rule** : entries with missing `symbol`, `price`, `change`, or `changesPercentage` are
 *   skipped rather than carrying NaN through the pipeline.
 * - **Error mapping** : 401/403 → `auth-failed`, 429 → `rate-limited`, 5xx → `upstream`.
 * - **Blank key short-circuit** : zero requests fired against the daily quota.
 */
class FmpMarketScreenerClientTest {

  private lateinit var server: MockWebServer
  private lateinit var client: FmpMarketScreenerClient

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
    client =
      FmpMarketScreenerClient(
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
  fun `merges gainers and losers into TickerMovers with previousClose derived from price minus change`() {
    server.enqueue(jsonOk(GAINERS_BODY))
    server.enqueue(jsonOk(LOSERS_BODY))

    val movers = client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)

    assertEquals(2, movers.size)
    val nvda = movers.first { it.symbol == "NVDA" }
    assertEquals("NVIDIA Corporation", nvda.name) // FMP supplies the name
    assertEquals("NASDAQ", nvda.exchange) // and the exchange
    assertEquals(BigDecimal("520.00"), nvda.price)
    // previousClose = price - change = 520 - 20 = 500.00
    assertEquals(BigDecimal("500.00"), nvda.previousClose)
    assertEquals(BigDecimal("4.00"), nvda.gapPct)
    // Volume sentinels — FMP gainers/losers doesn't expose volume
    assertEquals(0L, nvda.volume)
    assertEquals(0L, nvda.volumeAvg30d)
    assertEquals(BigDecimal.ZERO, nvda.volumeRatio)
    assertEquals(0L, nvda.marketCapUsd)
    assertEquals(null, nvda.sector)

    val wba = movers.first { it.symbol == "WBA" }
    // wba is a loser : gapPct negative, previousClose > price
    assertEquals(BigDecimal("12.00"), wba.price)
    assertEquals(BigDecimal("13.50"), wba.previousClose)
    assertEquals(BigDecimal("-11.11"), wba.gapPct)
  }

  @Test
  fun `passes the apikey query parameter on each call`() {
    server.enqueue(jsonOk(GAINERS_BODY))
    server.enqueue(jsonOk(LOSERS_BODY))

    client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)

    val gainersRequest = server.takeRequest()
    val gainersPath = gainersRequest.path ?: ""
    assertTrue(gainersPath.startsWith("/stable/biggest-gainers"))
    assertTrue(gainersPath.contains("apikey=$FAKE_API_KEY"))

    val losersRequest = server.takeRequest()
    val losersPath = losersRequest.path ?: ""
    assertTrue(losersPath.startsWith("/stable/biggest-losers"))
    assertTrue(losersPath.contains("apikey=$FAKE_API_KEY"))
  }

  @Test
  fun `returns an empty list when both endpoints return empty arrays`() {
    server.enqueue(jsonOk("[]"))
    server.enqueue(jsonOk("[]"))

    val movers = client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)

    assertTrue(movers.isEmpty())
  }

  @Test
  fun `filters out entries whose exchange does not match the universe`() {
    // Phase 6 ticket (8) v0.5 — the FMP payload carries `exchange` per entry, so the universe's
    // exchange bound (NASDAQ for US_SMALL_CAP_GAPPERS) is enforced at the adapter level. A mover on
    // NYSE / AMEX / OTC is dropped before the snapshot lands in the radar.
    server.enqueue(jsonOk(MIXED_EXCHANGE_GAINERS_BODY))
    server.enqueue(jsonOk("[]"))

    val movers = client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)

    assertEquals(1, movers.size)
    assertEquals("NASDAQONLY", movers.first().symbol)
  }

  // ---------------------------------------------------------------------- skip rules

  @Test
  fun `skips entries missing required fields rather than carrying NaN downstream`() {
    server.enqueue(jsonOk(GAINERS_WITH_PARTIAL_ENTRIES_BODY))
    server.enqueue(jsonOk("[]"))

    val movers = client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)

    // Only OKAY passes — SKIP_NO_SYMBOL (missing symbol), SKIP_NO_PRICE (zero price),
    // SKIP_NO_CHANGE (missing change), SKIP_NO_PCT (missing changesPercentage) all dropped.
    assertEquals(1, movers.size)
    assertEquals("OKAY", movers[0].symbol)
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
      FmpMarketScreenerClient(
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
    on { getString(ConfigKeys.FMP_API_KEY) } doReturn apiKey
  }

  private fun jsonOk(body: String): MockResponse =
    MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)

  private val FAKE_API_KEY = "fmp-test-key-1234"

  private val GAINERS_BODY =
    """
    [
      {
        "symbol": "NVDA",
        "name": "NVIDIA Corporation",
        "change": 20.00,
        "price": 520.00,
        "changesPercentage": 4.00,
        "exchange": "NASDAQ"
      }
    ]
    """
      .trimIndent()

  private val LOSERS_BODY =
    """
    [
      {
        "symbol": "WBA",
        "name": "Walgreens Boots Alliance",
        "change": -1.50,
        "price": 12.00,
        "changesPercentage": -11.11,
        "exchange": "NASDAQ"
      }
    ]
    """
      .trimIndent()

  private val MIXED_EXCHANGE_GAINERS_BODY =
    """
    [
      {
        "symbol": "NASDAQONLY",
        "name": "Nasdaq Mover",
        "change": 5.00,
        "price": 100.00,
        "changesPercentage": 5.26,
        "exchange": "NASDAQ"
      },
      {
        "symbol": "NYSEDROPPED",
        "name": "NYSE Mover",
        "change": 8.00,
        "price": 80.00,
        "changesPercentage": 11.11,
        "exchange": "NYSE"
      },
      {
        "symbol": "AMEXDROPPED",
        "name": "AMEX Mover",
        "change": 1.00,
        "price": 25.00,
        "changesPercentage": 4.17,
        "exchange": "AMEX"
      }
    ]
    """
      .trimIndent()

  private val GAINERS_WITH_PARTIAL_ENTRIES_BODY =
    """
    [
      {
        "symbol": "OKAY",
        "name": "OK Co",
        "change": 5.00,
        "price": 100.00,
        "changesPercentage": 5.26,
        "exchange": "NASDAQ"
      },
      {
        "name": "No Symbol Co",
        "change": 2.00,
        "price": 50.00,
        "changesPercentage": 4.17,
        "exchange": "NASDAQ"
      },
      {
        "symbol": "SKIP_NO_PRICE",
        "name": "Zero Price Co",
        "change": 1.00,
        "price": 0,
        "changesPercentage": 5.00,
        "exchange": "NASDAQ"
      },
      {
        "symbol": "SKIP_NO_CHANGE",
        "name": "No Change Co",
        "price": 50.00,
        "changesPercentage": 4.00,
        "exchange": "NASDAQ"
      },
      {
        "symbol": "SKIP_NO_PCT",
        "name": "No Pct Co",
        "change": 2.00,
        "price": 50.00,
        "exchange": "NASDAQ"
      }
    ]
    """
      .trimIndent()
}
