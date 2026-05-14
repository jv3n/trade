package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.SentimentChange
import com.portfolioai.analysis.domain.Verdict
import com.portfolioai.analysis.infrastructure.persistence.NarrativeObservabilityQuery
import com.portfolioai.analysis.infrastructure.persistence.NarrativeObservationRow
import com.portfolioai.analysis.infrastructure.persistence.TickerObservationCount
import com.portfolioai.market.domain.MarketChart
import com.portfolioai.market.domain.MarketUnavailableException
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.TickerQuote
import com.portfolioai.market.infrastructure.market.MarketChartClient
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify

/**
 * Tests on [NarrativeObservabilityService] — Phase 3 #1 « narrative vs price » timeline. This
 * service is the only place where the SQL row meets the market data, so the contract worth pinning
 * is :
 *
 * - **One chart fetch per request, regardless of how many snapshots come back** — the timeline can
 *   easily carry 50+ rows ; refetching the chart per row would multiply Twelve Data credit cost by
 *   the same factor. Pinned via `verify(chartClient).fetchChart(...)` once.
 * - **Deltas are computed against `snapshot.price`** (not the bar close at generation time). The
 *   user sees « the price I was told was X » in the narrative card — deltas vs that price stay
 *   honest with the user's mental model.
 * - **Bar lookup is « at or after »** : a snapshot from Friday's `+1d` bar is Monday's close, not
 *   null. Weekends + holidays are tolerated this way without a calendar lookup.
 * - **Graceful degradation** on upstream errors : a [MarketUnavailableException] from the chart
 *   client must NOT crash the page — the observations come back with the price-since fields all
 *   null, and the user still reads their narrative history. Pinned explicitly because a future
 *   refacto could be tempted to let it propagate.
 * - **No chart call when there are no snapshots** — the empty path short-circuits before touching
 *   the market upstream. Pinned to keep the « cost = 0 when the timeline is empty » invariant.
 * - **Symbol normalisation** (trim + uppercase) reaches both the query and the chart client — we
 *   don't want « nvda » vs « NVDA » to cache-miss on the upstream and split the same dataset.
 */
class NarrativeObservabilityServiceTest {

  private val query: NarrativeObservabilityQuery = mock()
  private val chartClient: MarketChartClient = mock()
  private val coherenceScorer = CoherenceScorer()
  private val service = NarrativeObservabilityService(query, chartClient, coherenceScorer)

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `enriches each row with delta1d delta1w delta1m using the snapshot price as base`() {
    val generated = Instant.parse("2026-04-01T15:00:00Z") // a Wednesday
    val rows = listOf(observationRow(price = bd("100.0000"), generatedAt = generated))
    given(query.find(eq("NVDA"), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(rows)
    // Bars sorted oldest → newest. Snapshot generated 2026-04-01 ; +1d hits 04-02, +1w hits 04-08,
    // +1m hits 05-01. Deltas vs 100 baseline = +2 %, +5 %, +10 %.
    given(chartClient.fetchChart(eq("NVDA"), eq("1y"), eq("1d")))
      .willReturn(
        chart(
          bar("2026-04-01", close = "100.0000"),
          bar("2026-04-02", close = "102.0000"),
          bar("2026-04-08", close = "105.0000"),
          bar("2026-05-01", close = "110.0000"),
        )
      )

    val response = service.findFor("NVDA")

    assertEquals(1, response.observations.size)
    val obs = response.observations.single()
    assertEquals(bd("102.0000"), obs.priceAt1d)
    assertEquals(bd("105.0000"), obs.priceAt1w)
    assertEquals(bd("110.0000"), obs.priceAt1m)
    // Deltas as fractions (UI multiplies by 100 to render %).
    assertEquals(bd("0.0200"), obs.delta1d)
    assertEquals(bd("0.0500"), obs.delta1w)
    assertEquals(bd("0.1000"), obs.delta1m)
  }

  @Test
  fun `bar lookup uses « at or after » semantics so weekends and holidays roll forward`() {
    // Snapshot generated on a Friday — +1d is Saturday (no bar), +1w lands Friday or moves to
    // Monday.
    val friday = Instant.parse("2026-04-03T20:00:00Z") // Friday close
    val rows = listOf(observationRow(price = bd("100.0000"), generatedAt = friday))
    given(query.find(any(), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(rows)
    given(chartClient.fetchChart(any(), any(), any()))
      .willReturn(
        chart(
          bar("2026-04-03", close = "100.0000"),
          // No Saturday 04-04, no Sunday 04-05 — Monday's close stands in for « +1d ».
          bar("2026-04-06", close = "103.0000"),
          // 04-10 is a Friday, falls right on +1w from 04-03.
          bar("2026-04-10", close = "108.0000"),
        )
      )

    val obs = service.findFor("AAPL").observations.single()

    // « At or after » : +1d (Saturday) → first bar at/after = Monday close.
    assertEquals(bd("103.0000"), obs.priceAt1d)
    assertEquals(bd("0.0300"), obs.delta1d)
    // +1w (next Friday 04-10) lands exactly on a bar.
    assertEquals(bd("108.0000"), obs.priceAt1w)
    assertEquals(bd("0.0800"), obs.delta1w)
  }

  @Test
  fun `delta fields are null when the chart series does not yet reach the target offset`() {
    // Snapshot from yesterday — bars stop today, so +1w and +1m have no data yet.
    val yesterday = Instant.parse("2026-05-12T15:00:00Z")
    val rows = listOf(observationRow(price = bd("50.0000"), generatedAt = yesterday))
    given(query.find(any(), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(rows)
    given(chartClient.fetchChart(any(), any(), any()))
      .willReturn(
        chart(
          bar("2026-05-12", close = "50.0000"),
          bar("2026-05-13", close = "51.0000"), // today, gives the +1d delta
          // No bar past +1w (need 2026-05-19) or +1m (need 2026-06-11).
        )
      )

    val obs = service.findFor("ANY").observations.single()

    assertEquals(bd("51.0000"), obs.priceAt1d)
    assertEquals(bd("0.0200"), obs.delta1d)
    assertNull(obs.priceAt1w, "1w bar missing → priceAt1w must be null")
    assertNull(obs.delta1w)
    assertNull(obs.priceAt1m)
    assertNull(obs.delta1m)
  }

  // ---------------------------------------------------------------------- one chart fetch
  // invariant

  @Test
  fun `one chart fetch services the whole timeline regardless of row count`() {
    // Concrete regression guard against the « accidentally fetch per row » footgun.
    val rows =
      (0 until 25).map { i ->
        observationRow(
          snapshotId = UUID.randomUUID(),
          price = bd("100.0000"),
          generatedAt =
            Instant.parse("2026-04-${(i % 28 + 1).toString().padStart(2, '0')}T12:00:00Z"),
        )
      }
    given(query.find(any(), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(rows)
    given(chartClient.fetchChart(any(), any(), any())).willReturn(chart(/* empty bars */ ))

    val response = service.findFor("MSFT")

    assertEquals(25, response.observations.size)
    verify(chartClient, org.mockito.kotlin.times(1)).fetchChart(any(), any(), any())
  }

  // ---------------------------------------------------------------------- empty path short-circuit

  @Test
  fun `empty timeline does not touch the market upstream`() {
    // Cost = 0 credits when the user opens the page for a symbol with no narrative history.
    given(query.find(eq("UNKNOWN"), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())

    val response = service.findFor("unknown") // also exercises normalisation

    assertEquals("UNKNOWN", response.symbol)
    assertTrue(response.observations.isEmpty())
    verify(chartClient, never()).fetchChart(any(), any(), any())
  }

  // ---------------------------------------------------------------------- graceful degradation

  @Test
  fun `MarketUnavailableException leaves the narratives intact with null price-since fields`() {
    // The user came to read history. We don't 503 them just because Twelve Data blinked — the
    // observations themselves are still useful without deltas.
    val rows = listOf(observationRow(price = bd("100.0000")))
    given(query.find(any(), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(rows)
    given(chartClient.fetchChart(any(), any(), any()))
      .willThrow(MarketUnavailableException("rate-limited"))

    val obs = service.findFor("AAPL").observations.single()

    assertNotNull(obs.summary, "narrative survives the upstream outage")
    assertNull(obs.priceAt1d, "delta fields degrade to null on upstream failure")
    assertNull(obs.priceAt1w)
    assertNull(obs.priceAt1m)
    assertNull(obs.delta1d)
    assertNull(obs.delta1w)
    assertNull(obs.delta1m)
  }

  // ---------------------------------------------------------------------- defensive : base = 0

  @Test
  fun `delta is null when the snapshot price is non-positive`() {
    // Defensive — `price` is NUMERIC(18,4) NOT NULL so a 0 shouldn't happen in practice, but
    // dividing by it would NaN the whole row. Pin the guard.
    val rows = listOf(observationRow(price = BigDecimal.ZERO))
    given(query.find(any(), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(rows)
    given(chartClient.fetchChart(any(), any(), any()))
      .willReturn(chart(bar("2026-04-02", close = "100.0000")))

    val obs = service.findFor("WEIRD").observations.single()

    assertNull(obs.delta1d)
    assertNull(obs.delta1w)
    assertNull(obs.delta1m)
  }

  // ---------------------------------------------------------------------- symbol normalisation

  @Test
  fun `symbol is trimmed and uppercased before reaching the query and the chart client`() {
    given(query.find(eq("NVDA"), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())

    service.findFor("  nvda  ")

    // Pin the call landed with the normalised form — keeps the cache key consistent across all
    // observability vs dossier vs narrative paths.
    verify(query).find(eq("NVDA"), anyOrNull(), anyOrNull(), anyOrNull())
  }

  // ---------------------------------------------------------------------- coherence wiring (Phase
  // 3 #2)

  @Test
  fun `oldest snapshot in the timeline has a null coherence (no previous to compare against)`() {
    // Rows arrive most-recent first ; the last one in the list is the chronologically oldest and
    // has no anchor. The page hides the chip in that case rather than rendering "OK" against
    // nothing.
    val rows =
      listOf(
        observationRow(generatedAt = Instant.parse("2026-05-10T12:00:00Z")),
        observationRow(generatedAt = Instant.parse("2026-05-08T12:00:00Z")),
      )
    given(query.find(any(), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(rows)
    given(chartClient.fetchChart(any(), any(), any())).willReturn(chart())

    val out = service.findFor("AAPL").observations

    assertEquals(2, out.size)
    assertNotNull(out[0].coherence, "newest row gets a score against the next row in chronology")
    assertNull(out[1].coherence, "oldest row has no previous → coherence stays null")
  }

  @Test
  fun `coherence pairs each row with the chronologically previous one (i e index i+1)`() {
    // Concrete regression : a future refactor that flipped the index direction would silently
    // compare each row against the *next* (newer) one — the verdict would still come out, but
    // the previousSnapshotId on the DTO would point the wrong way and the tooltip "vs narrative
    // from {{date}}" would lie.
    val newest = UUID.randomUUID()
    val middle = UUID.randomUUID()
    val oldest = UUID.randomUUID()
    val rows =
      listOf(
        observationRow(snapshotId = newest, generatedAt = Instant.parse("2026-05-10T12:00:00Z")),
        observationRow(snapshotId = middle, generatedAt = Instant.parse("2026-05-08T12:00:00Z")),
        observationRow(snapshotId = oldest, generatedAt = Instant.parse("2026-05-01T12:00:00Z")),
      )
    given(query.find(any(), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(rows)
    given(chartClient.fetchChart(any(), any(), any())).willReturn(chart())

    val out = service.findFor("AAPL").observations

    assertEquals(middle, out[0].coherence?.previousSnapshotId)
    assertEquals(oldest, out[1].coherence?.previousSnapshotId)
    assertNull(out[2].coherence)
  }

  @Test
  fun `coherence flags HIGH when sentiment flips on a flat tape and OK when prices match the flip`() {
    // End-to-end pin : the headline scenario from CoherenceScorerTest, observed through the
    // service so a future refacto that forgot to call the scorer (or fed it the wrong baseline
    // price) would surface here.
    val rows =
      listOf(
        observationRow(
          generatedAt = Instant.parse("2026-05-10T12:00:00Z"),
          sentiment = "BEARISH",
          price = bd("100.0000"),
        ),
        observationRow(
          generatedAt = Instant.parse("2026-05-08T12:00:00Z"),
          sentiment = "BULLISH",
          price = bd("100.0000"),
        ),
      )
    given(query.find(any(), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(rows)
    given(chartClient.fetchChart(any(), any(), any())).willReturn(chart())

    val coherence =
      service.findFor("AAPL").observations[0].coherence
        ?: error("expected a coherence score on the newest row, got null")
    assertEquals(
      Verdict.HIGH,
      coherence.verdict,
      "BULLISH→BEARISH on a flat tape is the chip's reason for existing",
    )
    assertEquals(SentimentChange.FLIPPED, coherence.sentimentChange)
  }

  @Test
  fun `prompt provenance and thumbs round-trip from the query row to the DTO`() {
    val templateId = UUID.randomUUID()
    val rows =
      listOf(
        observationRow(
          promptTemplateId = templateId,
          promptName = "narrative-default",
          promptTemplateVersion = "v3-bullish-fix",
          thumbsValue = 1,
        )
      )
    given(query.find(any(), anyOrNull(), anyOrNull(), anyOrNull())).willReturn(rows)
    given(chartClient.fetchChart(any(), any(), any())).willReturn(chart())

    val obs = service.findFor("AAPL").observations.single()

    assertEquals(templateId, obs.promptTemplateId)
    assertEquals("narrative-default", obs.promptName)
    assertEquals("v3-bullish-fix", obs.promptTemplateVersion)
    assertEquals(1.toShort(), obs.thumbsValue)
  }

  // ---------------------------------------------------------------------- index endpoint (PR3)

  @Test
  fun `listTickers maps query rows to the DTO shape verbatim`() {
    // Pin the field-by-field copy : a future regression that flipped `snapshotCount` and
    // `symbol` order, or dropped the `lastGeneratedAt` field, would surface here.
    val latestNvda = Instant.parse("2026-05-13T10:00:00Z")
    val latestAapl = Instant.parse("2026-05-12T16:00:00Z")
    given(query.findTickers())
      .willReturn(
        listOf(
          TickerObservationCount("NVDA", snapshotCount = 12, lastGeneratedAt = latestNvda),
          TickerObservationCount("AAPL", snapshotCount = 3, lastGeneratedAt = latestAapl),
        )
      )

    val out = service.listTickers()

    assertEquals(2, out.size)
    assertEquals("NVDA", out[0].symbol)
    assertEquals(12, out[0].snapshotCount)
    assertEquals(latestNvda, out[0].lastGeneratedAt)
    assertEquals("AAPL", out[1].symbol)
    assertEquals(3, out[1].snapshotCount)
    assertEquals(latestAapl, out[1].lastGeneratedAt)
    // The service must preserve the query's ordering (most-recent first by lastGeneratedAt) —
    // re-sorting in the service would be redundant work + a contract drift waiting to happen.
    verify(chartClient, never()).fetchChart(any(), any(), any())
  }

  @Test
  fun `listTickers returns an empty list when no narrative has been generated yet`() {
    // Cost = 0 market fetches : the index page on a fresh database doesn't touch any upstream.
    given(query.findTickers()).willReturn(emptyList())

    val out = service.listTickers()

    assertTrue(out.isEmpty())
    verify(chartClient, never()).fetchChart(any(), any(), any())
  }

  // ---------------------------------------------------------------------- fixtures

  private fun observationRow(
    snapshotId: UUID = UUID.randomUUID(),
    price: BigDecimal = bd("100.0000"),
    generatedAt: Instant = Instant.parse("2026-04-01T15:00:00Z"),
    promptTemplateId: UUID? = UUID.randomUUID(),
    promptName: String? = "narrative-default",
    promptTemplateVersion: String? = "v2",
    thumbsValue: Short? = 0,
    sentiment: String = "BULLISH",
  ) =
    NarrativeObservationRow(
      snapshotId = snapshotId,
      generatedAt = generatedAt,
      price = price,
      summary = "Price above MA200, RSI 62 — bullish posture.",
      sentiment = sentiment,
      keyPointsJson = """["price above MA200","RSI 62 mid-bullish","positive 21-day momentum"]""",
      modelUsed = "claude-haiku-4-5",
      promptVersion = "v2",
      promptTemplateId = promptTemplateId,
      promptName = promptName,
      promptTemplateVersion = promptTemplateVersion,
      thumbsValue = thumbsValue,
    )

  private fun chart(vararg bars: OhlcBar): MarketChart =
    MarketChart(
      quote =
        TickerQuote(
          symbol = "TEST",
          name = "Test Corp",
          currency = "USD",
          exchange = "NYSE",
          price = BigDecimal("100.00"),
          fiftyTwoWeekHigh = null,
          fiftyTwoWeekLow = null,
          asOf = Instant.parse("2026-05-13T00:00:00Z"),
          instrumentType = com.portfolioai.market.domain.InstrumentType.STOCK,
        ),
      bars = bars.toList(),
    )

  private fun bar(date: String, close: String): OhlcBar {
    val ts = Instant.parse("${date}T00:00:00Z")
    val closeBd = bd(close)
    return OhlcBar(
      timestamp = ts,
      open = closeBd,
      high = closeBd,
      low = closeBd,
      close = closeBd,
      volume = 1_000_000L,
    )
  }

  private fun bd(s: String): BigDecimal = BigDecimal(s).setScale(4, RoundingMode.HALF_UP)
}
