package com.portfolioai.market.infrastructure.market

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
 * Tests on [FinnhubSectorClassifier] against a local [MockWebServer]. Mirrors
 * [com.portfolioai.news.infrastructure.news.FinnhubClientTest] — same auth / error-mapping
 * conventions, same shape.
 *
 * What we pin :
 * - **Happy path** — `finnhubIndustry` lookup resolves to the correct SPDR sector ETF via
 *   [SpdrSectorEtfs] (uppercase symbol echoed back, sector name + ETF symbol + ETF full name).
 * - **Symbol passthrough** — the adapter forwards the symbol it received verbatim into the URL.
 *   Normalisation lives one layer up at the service / controller boundary (audit 2026-05-06 finding
 *   "coutures benchmark v2") ; this adapter trusts its input is already trimmed + uppercase.
 * - **Empty profile body** — Finnhub's "we don't cover this symbol" signal is `{}` (HTTP 200 with
 *   no fields). The adapter raises [NoSuchElementException] which the global handler maps to HTTP
 *   404 (distinct from the 503 path used for upstream failures).
 * - **Unknown sector** — when `finnhubIndustry` doesn't map to any SPDR-covered GICS sector
 *   (Conglomerates, Crypto, …), [NoSuchElementException] is raised so the front shows "no sector
 *   benchmark" inline.
 * - **Error mapping** — 401/403 → `auth-failed`, 429 → `rate-limited`, 5xx → `upstream`, network →
 *   `unreachable`. All surface as [UpstreamUnavailableException] (HTTP 503).
 * - **Blank API key** — short-circuits before any HTTP call so a misconfigured environment doesn't
 *   waste a network round-trip.
 */
class FinnhubSectorClassifierTest {

  private lateinit var server: MockWebServer
  private lateinit var client: FinnhubSectorClassifier

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
    client =
      FinnhubSectorClassifier(
        rest = RestClient.builder().build(),
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
  fun `resolves a covered ticker to its SPDR sector ETF`() {
    server.enqueue(jsonOk(AAPL_TECH_PROFILE))

    val out = client.classify("AAPL")

    assertEquals("Technology", out.sector)
    assertEquals("XLK", out.etfSymbol)
    assertEquals("Technology Select Sector SPDR Fund", out.etfName)
  }

  @Test
  fun `resolves a Finnhub-flavoured industry name via the synonym map`() {
    // Finnhub uses "Financial Services" where GICS / our canonical labels say "Financials". The
    // synonym table absorbs this — pin it so a refactor of SpdrSectorEtfs doesn't break Finnhub
    // round-trip.
    server.enqueue(jsonOk(JPM_FINANCIAL_SERVICES_PROFILE))

    val out = client.classify("JPM")

    assertEquals("Financials", out.sector)
    assertEquals("XLF", out.etfSymbol)
  }

  @Test
  fun `forwards the pre-normalised symbol verbatim into the URL`() {
    // Caller contract is "trimmed + uppercase" — the service/controller normalises once at the
    // boundary, the adapter passes through. We pin the passthrough here so a future regression
    // (someone re-adds a `.uppercase()` and accidentally double-encodes) is caught.
    server.enqueue(jsonOk(AAPL_TECH_PROFILE))

    client.classify("AAPL")

    val recorded = server.takeRequest()
    assertTrue(recorded.path?.contains("symbol=AAPL") ?: false)
  }

  @Test
  fun `URL carries the api token`() {
    server.enqueue(jsonOk(AAPL_TECH_PROFILE))

    client.classify("AAPL")

    val path = server.takeRequest().path ?: ""
    assertTrue(path.contains("token=$FAKE_KEY"), "Missing token: $path")
  }

  // ---------------------------------------------------------------------- empty / unknown

  @Test
  fun `empty profile body raises NoSuchElementException`() {
    // Finnhub returns `{}` (HTTP 200) for symbols outside its universe rather than a proper 404.
    // The adapter detects the empty `ticker` field and surfaces this as 404 → "no sector
    // benchmark" empty state on the front.
    server.enqueue(jsonOk("{}"))

    assertThrows<NoSuchElementException> { client.classify("XXXXX") }
  }

  @Test
  fun `industry outside the SPDR mapping raises NoSuchElementException`() {
    // E.g. exotic ETFs / commodities / crypto symbols that Finnhub categorises but we don't have a
    // SPDR sector ETF for. We'd rather surface "no sector benchmark" than plot a misleading one.
    server.enqueue(jsonOk(BTC_CRYPTO_PROFILE))

    assertThrows<NoSuchElementException> { client.classify("GBTC") }
  }

  // ---------------------------------------------------------------------- error mapping

  @Test
  fun `maps 401 to UpstreamUnavailableException with auth-failed`() {
    server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Invalid API key"}"""))

    val ex = assertThrows<UpstreamUnavailableException> { client.classify("AAPL") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps 403 to UpstreamUnavailableException with auth-failed`() {
    server.enqueue(MockResponse().setResponseCode(403).setBody("""{"error":"Forbidden"}"""))

    val ex = assertThrows<UpstreamUnavailableException> { client.classify("AAPL") }
    assertTrue(ex.message?.contains("auth-failed") ?: false)
  }

  @Test
  fun `maps 429 to UpstreamUnavailableException with rate-limited`() {
    server.enqueue(MockResponse().setResponseCode(429).setBody(""))

    val ex = assertThrows<UpstreamUnavailableException> { client.classify("AAPL") }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `maps 500 to UpstreamUnavailableException with upstream`() {
    server.enqueue(MockResponse().setResponseCode(500).setBody("internal error"))

    val ex = assertThrows<UpstreamUnavailableException> { client.classify("AAPL") }
    assertTrue(ex.message?.contains("upstream") ?: false)
  }

  // ---------------------------------------------------------------------- guards

  @Test
  fun `raises a clear error when the api key is blank`() {
    val noKey =
      FinnhubSectorClassifier(
        rest = RestClient.builder().build(),
        appConfig = mockAppConfig(""),
        baseUrl = server.url("/").toString().trimEnd('/'),
      )

    val ex = assertThrows<UpstreamUnavailableException> { noKey.classify("AAPL") }
    assertTrue(ex.message?.contains("API key") ?: false)
    assertEquals(0, server.requestCount)
  }

  @Test
  fun `raises NoSuchElementException on a blank symbol without HTTP call`() {
    assertThrows<NoSuchElementException> { client.classify("   ") }
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

  private val AAPL_TECH_PROFILE =
    """
    {
      "ticker": "AAPL",
      "name": "Apple Inc",
      "country": "US",
      "currency": "USD",
      "exchange": "NASDAQ NMS - GLOBAL MARKET",
      "finnhubIndustry": "Technology",
      "logo": "https://example.com/aapl.png",
      "weburl": "https://www.apple.com/"
    }
    """
      .trimIndent()

  /** Finnhub flavour : "Financial Services" instead of GICS-canonical "Financials". */
  private val JPM_FINANCIAL_SERVICES_PROFILE =
    """
    {
      "ticker": "JPM",
      "name": "JPMorgan Chase",
      "country": "US",
      "currency": "USD",
      "finnhubIndustry": "Financial Services"
    }
    """
      .trimIndent()

  /** Symbol Finnhub categorises but no SPDR sector covers — should surface as 404. */
  private val BTC_CRYPTO_PROFILE =
    """
    {
      "ticker": "GBTC",
      "name": "Grayscale Bitcoin Trust",
      "country": "US",
      "currency": "USD",
      "finnhubIndustry": "Crypto Trust"
    }
    """
      .trimIndent()
}
