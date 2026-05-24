package com.portfolioai.analysis.application

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.analysis.infrastructure.persistence.BiasSnapshotRow
import com.portfolioai.analysis.infrastructure.persistence.NarrativeBiasQuery
import com.portfolioai.analysis.infrastructure.persistence.SentimentCountRow
import com.portfolioai.analysis.infrastructure.persistence.ThumbsBySentimentRow
import com.portfolioai.market.domain.InstrumentType
import com.portfolioai.market.domain.MarketChart
import com.portfolioai.market.domain.MarketChartClient
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.TickerQuote
import com.portfolioai.shared.UpstreamUnavailableException
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
import org.mockito.kotlin.times
import org.mockito.kotlin.verify

/**
 * Tests on [NarrativeBiasService] — Phase 3 #3 bias dashboard. Covers the four sections that the
 * service composes from one SQL aggregation, one thumbs aggregation, and one raw fetch enriched by
 * per-symbol chart calls. The contracts worth pinning :
 *
 * - **Sentiment distribution always includes the three buckets** (zero-padded), so the page never
 *   loses a column when one sentiment is empty in the window. « zero BEARISH » is itself a strong
 *   signal we want to surface.
 * - **Bias flag fires at exactly 60 %** : a 59 % bucket is fine, a 60 % bucket triggers. Pinned
 *   because the threshold is a product decision, not an implementation detail.
 * - **Calibration averages skip null deltas** (window not elapsed / upstream missing) without
 *   propagating the null into the average — the page wants `+2.34 % / 28` not `null` when 4
 *   snapshots out of 32 lack a 1m bar.
 * - **One chart fetch per unique symbol** regardless of how many snapshots come from that symbol.
 *   Critical because the corpus can carry 50+ snapshots across ~10 symbols ; refetching per
 *   snapshot would multiply the chart cost by N.
 * - **Graceful degradation** on chart failures : a `UpstreamUnavailableException` for one symbol
 *   nulls its calibration contributions but does NOT crash the request — the other three sections
 *   still render.
 * - **Lower-bound guard on the bar lookup** : a snapshot dated before the chart's earliest bar is
 *   excluded from the calibration averages rather than skewing them by a ~12-month price gap
 *   reported as « delta1d ». Symmetric with the same guard pinned in
 *   `NarrativeObservabilityServiceTest`.
 * - **Topic coverage** counts « N snapshots mentioned this token at least once », not raw word
 *   frequency — a verbose narrative repeating « rsi » 5 times still counts as one. Stopwords +
 *   short tokens are filtered out, case is normalised.
 * - **Thumbs distribution always includes the three buckets**, with zero counts when empty.
 */
class NarrativeBiasServiceTest {

  private val query: NarrativeBiasQuery = mock()
  private val chartClient: MarketChartClient = mock()
  private val service = NarrativeBiasService(query, chartClient, jacksonObjectMapper())

  // ---------------------------------------------------------------------- sentiment distribution

  @Test
  fun `sentiment distribution zero-pads the three buckets even when one is empty in the window`() {
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(listOf(SentimentCountRow("BULLISH", 8L), SentimentCountRow("NEUTRAL", 2L)))
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())

    val out = service.computeBias()

    val buckets = out.sentimentDistribution.buckets
    assertEquals(3, buckets.size, "always render the three sentiments")
    assertEquals(8, buckets.first { it.sentiment == Sentiment.BULLISH }.count)
    assertEquals(2, buckets.first { it.sentiment == Sentiment.NEUTRAL }.count)
    assertEquals(0, buckets.first { it.sentiment == Sentiment.BEARISH }.count)
    assertEquals(10, out.snapshotsConsidered)
  }

  @Test
  fun `bias flag fires at 60 percent and not at 59 percent`() {
    // Pin the exact threshold — the 60 % decision is a product choice, not an implementation
    // detail. A regression that drifted to 50 % or 70 % would surface here immediately.
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(listOf(SentimentCountRow("BULLISH", 60L), SentimentCountRow("NEUTRAL", 40L)))
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())

    val out = service.computeBias()

    val flag = out.sentimentDistribution.biasFlag
    assertNotNull(flag)
    assertEquals(Sentiment.BULLISH, flag!!.sentiment)
    assertEquals(0, flag.percent.compareTo(BigDecimal("0.6000")))
  }

  @Test
  fun `bias flag fires on a fractional ratio that rounds UP to 0_6000 via HALF_UP at scale 4`() {
    // Pin the rounding contract — `percentOf` divides with `RoundingMode.HALF_UP` at scale 4, so
    // a count/total whose exact value is just below 0.6 can still flag if the 5th decimal is ≥ 5.
    // Concretely : 5999 / 9999 = 0.59995999... → HALF_UP at scale 4 → 0.6000 → ≥ threshold →
    // flagged. A future refactor that switches to HALF_EVEN or RoundingMode.DOWN would silently
    // change this behavior ; this test surfaces the regression.
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(listOf(SentimentCountRow("BULLISH", 5999L), SentimentCountRow("NEUTRAL", 4000L)))
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())

    val out = service.computeBias()

    val flag = out.sentimentDistribution.biasFlag
    assertNotNull(flag)
    assertEquals(Sentiment.BULLISH, flag!!.sentiment)
    // 5999 / 9999 rounded HALF_UP at scale 4 lands exactly on the threshold.
    assertEquals(0, flag.percent.compareTo(BigDecimal("0.6000")))
  }

  @Test
  fun `bias flag stays null when no bucket dominates above 60 percent`() {
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(
        listOf(
          SentimentCountRow("BULLISH", 50L),
          SentimentCountRow("NEUTRAL", 30L),
          SentimentCountRow("BEARISH", 20L),
        )
      )
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())

    val out = service.computeBias()

    assertNull(out.sentimentDistribution.biasFlag)
  }

  @Test
  fun `bias flag stays null on empty corpus (no division by zero)`() {
    // The dominant-bucket check would otherwise compare 0/0 and surface a phantom flag.
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())

    val out = service.computeBias()

    assertNull(out.sentimentDistribution.biasFlag)
    assertEquals(0, out.snapshotsConsidered)
  }

  // ---------------------------------------------------------------------- calibration

  @Test
  fun `calibration averages skip null deltas and report contributing counts`() {
    // Three BULLISH snapshots on AAPL : two have +1d data, one is too recent. Average should be
    // computed over the two contributing rows, not three.
    val today = Instant.parse("2026-05-13T15:00:00Z")
    val twoWeeksAgo = Instant.parse("2026-04-29T15:00:00Z")
    val oneWeekAgo = Instant.parse("2026-05-06T15:00:00Z")
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(listOf(SentimentCountRow("BULLISH", 3L)))
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(
        listOf(
          biasRow(
            symbol = "AAPL",
            price = bd("100"),
            generatedAt = twoWeeksAgo,
            sentiment = "BULLISH",
          ),
          biasRow(
            symbol = "AAPL",
            price = bd("100"),
            generatedAt = oneWeekAgo,
            sentiment = "BULLISH",
          ),
          biasRow(symbol = "AAPL", price = bd("100"), generatedAt = today, sentiment = "BULLISH"),
        )
      )
    // Bars cover the older two snapshots' +1d, but not today's.
    given(chartClient.fetchChart(any(), any(), any()))
      .willReturn(
        chart(
          bar("2026-04-29", close = "100"),
          bar("2026-04-30", close = "104"), // +1d for the two-weeks-ago snapshot → +4 %
          bar("2026-05-06", close = "100"),
          bar("2026-05-07", close = "102"), // +1d for the one-week-ago snapshot → +2 %
          bar("2026-05-13", close = "100"),
          // No 2026-05-14 bar → today's +1d is null.
        )
      )

    val out = service.computeBias()

    val bullish = out.calibration.first { it.sentiment == Sentiment.BULLISH }
    assertEquals(3, bullish.snapshotsTotal)
    assertEquals(2, bullish.snapshotsWithDelta1d, "today's snapshot has no +1d bar yet")
    // Average of +4 % and +2 % = +3 %
    assertEquals(0, bullish.avgDelta1d!!.compareTo(BigDecimal("0.0300")))
  }

  @Test
  fun `calibration fetches the chart exactly once per unique symbol`() {
    // Five snapshots split across two symbols → two chart calls, not five.
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(
        listOf(
          biasRow(symbol = "AAPL"),
          biasRow(symbol = "AAPL"),
          biasRow(symbol = "AAPL"),
          biasRow(symbol = "NVDA"),
          biasRow(symbol = "NVDA"),
        )
      )
    given(chartClient.fetchChart(any(), any(), any())).willReturn(chart())

    service.computeBias()

    verify(chartClient, times(2)).fetchChart(any(), any(), any())
  }

  @Test
  fun `UpstreamUnavailableException for one symbol nulls its calibration but the rest survives`() {
    // AAPL chart fails ; NVDA still computes. The page reads two BULLISH rows from AAPL with
    // null deltas, two BULLISH rows from NVDA with valid deltas → average reflects only the
    // valid contributions.
    val generated = Instant.parse("2026-04-01T15:00:00Z")
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(listOf(SentimentCountRow("BULLISH", 4L)))
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(
        listOf(
          biasRow(
            symbol = "AAPL",
            price = bd("100"),
            generatedAt = generated,
            sentiment = "BULLISH",
          ),
          biasRow(
            symbol = "AAPL",
            price = bd("100"),
            generatedAt = generated,
            sentiment = "BULLISH",
          ),
          biasRow(
            symbol = "NVDA",
            price = bd("100"),
            generatedAt = generated,
            sentiment = "BULLISH",
          ),
          biasRow(
            symbol = "NVDA",
            price = bd("100"),
            generatedAt = generated,
            sentiment = "BULLISH",
          ),
        )
      )
    given(chartClient.fetchChart(eq("AAPL"), any(), any()))
      .willThrow(UpstreamUnavailableException("rate-limited"))
    given(chartClient.fetchChart(eq("NVDA"), any(), any()))
      .willReturn(chart(bar("2026-04-01", close = "100"), bar("2026-04-02", close = "105")))

    val out = service.computeBias()

    val bullish = out.calibration.first { it.sentiment == Sentiment.BULLISH }
    assertEquals(4, bullish.snapshotsTotal)
    assertEquals(2, bullish.snapshotsWithDelta1d, "AAPL's two snapshots have null delta")
    // Average over the 2 NVDA contributions only = +5 %
    assertEquals(0, bullish.avgDelta1d!!.compareTo(BigDecimal("0.0500")))
    // Other sections still render.
    assertNotNull(out.sentimentDistribution)
    assertNotNull(out.topicCoverage)
    assertNotNull(out.thumbsDistribution)
  }

  @Test
  fun `snapshot dated before the chart's earliest bar is excluded from the calibration averages`() {
    // Same friction as in the observability service : a year-old snapshot paired with a 1Y chart
    // that starts after the snapshot would otherwise see `priceAtOrAfter` return the chart's
    // earliest bar — turning a ~12-month price move into « delta1d » and skewing the calibration
    // average. Pin the guard : the stale snapshot contributes null deltas, only the recent one
    // counts toward the average.
    val stale = Instant.parse("2025-05-10T15:00:00Z")
    val recent = Instant.parse("2026-04-29T15:00:00Z")
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(listOf(SentimentCountRow("BULLISH", 2L)))
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(
        listOf(
          biasRow(symbol = "AAPL", price = bd("100"), generatedAt = stale, sentiment = "BULLISH"),
          biasRow(symbol = "AAPL", price = bd("100"), generatedAt = recent, sentiment = "BULLISH"),
        )
      )
    // Chart starts well after the stale snapshot ; covers +1d for the recent one.
    given(chartClient.fetchChart(any(), any(), any()))
      .willReturn(
        chart(
          bar("2026-04-29", close = "100"),
          bar("2026-04-30", close = "103"), // +1d for the recent snapshot → +3 %
        )
      )

    val out = service.computeBias()

    val bullish = out.calibration.first { it.sentiment == Sentiment.BULLISH }
    assertEquals(2, bullish.snapshotsTotal)
    assertEquals(
      1,
      bullish.snapshotsWithDelta1d,
      "stale snapshot pre-dating the chart must be excluded",
    )
    // Average over the one contributing row only — the stale snapshot does not pull it toward 0.
    assertEquals(0, bullish.avgDelta1d!!.compareTo(BigDecimal("0.0300")))
  }

  // ---------------------------------------------------------------------- topic coverage

  @Test
  fun `topic coverage counts each snapshot once even when the same token repeats inside it`() {
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(
        listOf(
          // "RSI" appears 3× across two key_points — should still count as 1 snapshot.
          biasRow(keyPoints = listOf("rsi rolling over", "rsi 62", "RSI bullish posture")),
          biasRow(keyPoints = listOf("ma200 reclaim", "low volatility")),
        )
      )
    given(chartClient.fetchChart(any(), any(), any())).willReturn(chart())

    val topics = service.computeBias().topicCoverage.topics

    val rsi = topics.first { it.topic == "rsi" }
    assertEquals(1, rsi.count, "rsi mentioned in 1 of 2 snapshots, not 3 of 2")
    assertEquals(0, rsi.percent.compareTo(BigDecimal("0.5000")))
  }

  @Test
  fun `topic coverage filters stopwords and short tokens`() {
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(
        listOf(biasRow(keyPoints = listOf("the price is above the MA200 with a low rsi")))
      )
    given(chartClient.fetchChart(any(), any(), any())).willReturn(chart())

    val topics = service.computeBias().topicCoverage.topics.map { it.topic }

    assertTrue("rsi" in topics)
    assertTrue("ma200" in topics)
    assertTrue("low" in topics)
    // Stopwords + filler should not surface
    assertTrue("the" !in topics, "stopword 'the' must be filtered")
    assertTrue("price" !in topics, "filler 'price' must be filtered")
    assertTrue("with" !in topics)
    // Single-letter / two-letter tokens too short
    assertTrue("a" !in topics)
    assertTrue("is" !in topics)
  }

  // ---------------------------------------------------------------------- thumbs distribution

  @Test
  fun `thumbs distribution zero-pads missing sentiment buckets`() {
    given(query.sentimentCounts(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())
    given(query.thumbsBySentiment(anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(
        listOf(
          ThumbsBySentimentRow(
            "BULLISH",
            thumbsUp = 5L,
            thumbsNeutral = 3L,
            thumbsDown = 1L,
            noVote = 0L,
          )
        )
      )
    given(query.rawSnapshots(anyOrNull(), anyOrNull(), anyOrNull())).willReturn(emptyList())

    val buckets = service.computeBias().thumbsDistribution

    assertEquals(3, buckets.size)
    val bullish = buckets.first { it.sentiment == Sentiment.BULLISH }
    assertEquals(5, bullish.thumbsUp)
    assertEquals(3, bullish.thumbsNeutral)
    assertEquals(1, bullish.thumbsDown)
    val bearish = buckets.first { it.sentiment == Sentiment.BEARISH }
    assertEquals(0, bearish.thumbsUp)
    assertEquals(0, bearish.thumbsDown)
  }

  // ---------------------------------------------------------------------- fixtures

  private fun biasRow(
    snapshotId: UUID = UUID.randomUUID(),
    symbol: String = "AAPL",
    price: BigDecimal = bd("100.00"),
    generatedAt: Instant = Instant.parse("2026-04-01T15:00:00Z"),
    sentiment: String = "BULLISH",
    keyPoints: List<String> = listOf("rsi 62", "ma200 reclaim"),
  ): BiasSnapshotRow {
    val keyPointsJson =
      keyPoints.joinToString(prefix = "[", postfix = "]") { "\"${it.replace("\"", "\\\"")}\"" }
    return BiasSnapshotRow(
      snapshotId = snapshotId,
      symbol = symbol,
      generatedAt = generatedAt,
      sentiment = sentiment,
      price = price,
      keyPointsJson = keyPointsJson,
    )
  }

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
          instrumentType = InstrumentType.STOCK,
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
