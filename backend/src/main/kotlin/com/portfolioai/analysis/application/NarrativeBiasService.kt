package com.portfolioai.analysis.application

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.analysis.application.dto.BiasFlagDto
import com.portfolioai.analysis.application.dto.CalibrationBucketDto
import com.portfolioai.analysis.application.dto.NarrativeBiasResponse
import com.portfolioai.analysis.application.dto.SentimentBucketDto
import com.portfolioai.analysis.application.dto.SentimentDistributionDto
import com.portfolioai.analysis.application.dto.ThumbsBucketDto
import com.portfolioai.analysis.application.dto.TopicCoverageDto
import com.portfolioai.analysis.application.dto.TopicDto
import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.analysis.infrastructure.persistence.BiasSnapshotRow
import com.portfolioai.analysis.infrastructure.persistence.NarrativeBiasQuery
import com.portfolioai.market.domain.MarketChartClient
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

/**
 * Phase 3 #3 — orchestrates the four bias dashboard sections. Two SQL aggregations + one raw row
 * fetch from [NarrativeBiasQuery], plus per-symbol chart fetches for calibration deltas.
 *
 * **Cost** : the SQL side is one round-trip per section ; the calibration side fetches the 1Y daily
 * chart **once per unique symbol** in the corpus (cache-friendly via Caffeine — symbols the user
 * already opened in their dossier are warm). The raw snapshot list is capped at 2 000 rows by the
 * query layer ; with a single-user workload + ~10 distinct symbols × ~50 snapshots each, we're well
 * below the cap.
 *
 * **Graceful degradation** on chart failures : a [UpstreamUnavailableException] for one symbol
 * skips its rows from the calibration averages (their delta contributions become null) but does NOT
 * crash the request — the other three sections still render. The page is responsible for the «
 * calibration partielle, prix indisponible pour N symbols » hint when the average count drops below
 * the bucket count.
 *
 * **Why heuristic over LLM-as-judge** for topic coverage : the same reasoning as Phase 3 #2 — cost,
 * transparency, determinism. The user reads the top-N tokens and decides if « volatility » being
 * absent is a feature or a bug ; an LLM would either rubber-stamp or hallucinate critique.
 */
@Service
class NarrativeBiasService(
  private val query: NarrativeBiasQuery,
  private val chartClient: MarketChartClient,
  private val mapper: ObjectMapper,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun computeBias(
    from: Instant? = null,
    to: Instant? = null,
    promptTemplateId: UUID? = null,
  ): NarrativeBiasResponse {
    val sentimentRows = query.sentimentCounts(from, to, promptTemplateId)
    val thumbsRows = query.thumbsBySentiment(from, to, promptTemplateId)
    val rawSnapshots = query.rawSnapshots(from, to, promptTemplateId)

    val total = sentimentRows.sumOf { it.count }.toInt()
    val sentimentDistribution = buildSentimentDistribution(sentimentRows, total)
    val calibration = buildCalibration(rawSnapshots)
    val topicCoverage = buildTopicCoverage(rawSnapshots)
    val thumbsDistribution = buildThumbsDistribution(thumbsRows)

    return NarrativeBiasResponse(
      snapshotsConsidered = total,
      sentimentDistribution = sentimentDistribution,
      calibration = calibration,
      topicCoverage = topicCoverage,
      thumbsDistribution = thumbsDistribution,
    )
  }

  // ---------------------------------------------------------------------- sentiment distribution

  private fun buildSentimentDistribution(
    rows: List<com.portfolioai.analysis.infrastructure.persistence.SentimentCountRow>,
    total: Int,
  ): SentimentDistributionDto {
    // Build a zero-padded distribution so the page always renders the three sentiment bars
    // (otherwise an empty BEARISH bucket would silently disappear, which would be confusing —
    // « zero BEARISH » is itself a strong signal we want to surface).
    val byKey = rows.associateBy { it.sentiment }
    val buckets =
      Sentiment.entries.map { sentiment ->
        val count = byKey[sentiment.name]?.count?.toInt() ?: 0
        SentimentBucketDto(sentiment = sentiment, count = count, percent = percentOf(count, total))
      }
    val biasFlag =
      buckets
        .maxByOrNull { it.percent }
        ?.takeIf { it.percent >= BIAS_THRESHOLD && total > 0 }
        ?.let {
          BiasFlagDto(sentiment = it.sentiment, percent = it.percent, threshold = BIAS_THRESHOLD)
        }
    return SentimentDistributionDto(total = total, buckets = buckets, biasFlag = biasFlag)
  }

  // ---------------------------------------------------------------------- calibration

  private fun buildCalibration(rawSnapshots: List<BiasSnapshotRow>): List<CalibrationBucketDto> {
    if (rawSnapshots.isEmpty()) {
      return Sentiment.entries.map { emptyCalibrationBucket(it) }
    }

    // Fetch the chart once per unique symbol — Caffeine cache hits for symbols the user has
    // already opened in their dossier mean this is essentially free in practice.
    val barsBySymbol: Map<String, List<OhlcBar>> =
      rawSnapshots
        .map { it.symbol }
        .distinct()
        .associateWith { symbol ->
          try {
            chartClient.fetchChart(symbol, range = "1y", interval = "1d").bars
          } catch (e: UpstreamUnavailableException) {
            log.warn("Skipping calibration deltas for symbol={} — upstream unavailable", symbol, e)
            emptyList()
          }
        }

    // For each snapshot, compute its three deltas (each may be null if window not elapsed or
    // upstream missing), then group by sentiment and average the non-null contributions.
    val perSentiment = rawSnapshots.groupBy { it.sentiment }
    return Sentiment.entries.map { sentiment ->
      val bucket = perSentiment[sentiment.name].orEmpty()
      if (bucket.isEmpty()) return@map emptyCalibrationBucket(sentiment)
      val deltas = bucket.map { row ->
        val bars = barsBySymbol[row.symbol].orEmpty()
        val generatedDate = row.generatedAt.atOffset(ZoneOffset.UTC).toLocalDate()
        Triple(
          delta(row.price, priceAtOrAfter(bars, generatedDate.plusDays(1))),
          delta(row.price, priceAtOrAfter(bars, generatedDate.plusDays(7))),
          delta(row.price, priceAtOrAfter(bars, generatedDate.plusDays(30))),
        )
      }
      val (d1d, d1w, d1m) = deltas.unzip3()
      CalibrationBucketDto(
        sentiment = sentiment,
        snapshotsTotal = bucket.size,
        snapshotsWithDelta1d = d1d.count { it != null },
        snapshotsWithDelta1w = d1w.count { it != null },
        snapshotsWithDelta1m = d1m.count { it != null },
        avgDelta1d = average(d1d),
        avgDelta1w = average(d1w),
        avgDelta1m = average(d1m),
      )
    }
  }

  private fun emptyCalibrationBucket(sentiment: Sentiment) =
    CalibrationBucketDto(
      sentiment = sentiment,
      snapshotsTotal = 0,
      snapshotsWithDelta1d = 0,
      snapshotsWithDelta1w = 0,
      snapshotsWithDelta1m = 0,
      avgDelta1d = null,
      avgDelta1w = null,
      avgDelta1m = null,
    )

  // ---------------------------------------------------------------------- topic coverage

  private fun buildTopicCoverage(rawSnapshots: List<BiasSnapshotRow>): TopicCoverageDto {
    if (rawSnapshots.isEmpty()) {
      return TopicCoverageDto(snapshotsTotal = 0, topics = emptyList())
    }
    // Per-snapshot occurrence : we count « N snapshots mentioned this token at least once »,
    // not raw word frequency — otherwise a single verbose narrative repeating « rsi » 5 times
    // would skew the distribution.
    val tokenSnapshotCount = mutableMapOf<String, Int>()
    rawSnapshots.forEach { row ->
      val keyPoints: List<String> =
        try {
          mapper.readValue(row.keyPointsJson, Array<String>::class.java).toList()
        } catch (e: Exception) {
          log.warn("Skipping unparsable key_points_json for snapshot={}", row.snapshotId, e)
          emptyList()
        }
      val tokens = keyPoints.flatMap(::tokenize).toSet()
      tokens.forEach { token -> tokenSnapshotCount.merge(token, 1, Int::plus) }
    }
    val total = rawSnapshots.size
    val topics =
      tokenSnapshotCount.entries
        .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
        .take(TOP_N_TOPICS)
        .map { (topic, count) ->
          TopicDto(topic = topic, count = count, percent = percentOf(count, total))
        }
    return TopicCoverageDto(snapshotsTotal = total, topics = topics)
  }

  /**
   * Splits a key_point phrase into normalised tokens : lowercased + alpha-only + length ≥ 3 +
   * stopword-filtered. Returns the unique set per phrase (a phrase that names "rsi" twice still
   * yields one "rsi" — caller flattens across the snapshot's key_points then dedupes again).
   */
  internal fun tokenize(phrase: String): Set<String> =
    TOKEN_REGEX.findAll(phrase.lowercase())
      .map { it.value }
      .filter { it.length >= MIN_TOKEN_LENGTH && it !in STOPWORDS }
      .toSet()

  // ---------------------------------------------------------------------- thumbs distribution

  private fun buildThumbsDistribution(
    rows: List<com.portfolioai.analysis.infrastructure.persistence.ThumbsBySentimentRow>
  ): List<ThumbsBucketDto> {
    val byKey = rows.associateBy { it.sentiment }
    return Sentiment.entries.map { sentiment ->
      val row = byKey[sentiment.name]
      ThumbsBucketDto(
        sentiment = sentiment,
        thumbsUp = (row?.thumbsUp ?: 0L).toInt(),
        thumbsNeutral = (row?.thumbsNeutral ?: 0L).toInt(),
        thumbsDown = (row?.thumbsDown ?: 0L).toInt(),
        noVote = (row?.noVote ?: 0L).toInt(),
      )
    }
  }

  // ---------------------------------------------------------------------- helpers

  private fun percentOf(count: Int, total: Int): BigDecimal {
    if (total <= 0) return BigDecimal.ZERO.setScale(SCALE)
    return BigDecimal(count).divide(BigDecimal(total), SCALE, RoundingMode.HALF_UP)
  }

  private fun average(values: List<BigDecimal?>): BigDecimal? {
    val present = values.filterNotNull()
    if (present.isEmpty()) return null
    val sum = present.fold(BigDecimal.ZERO) { acc, v -> acc.add(v) }
    return sum.divide(BigDecimal(present.size), SCALE, RoundingMode.HALF_UP)
  }

  /**
   * Mirror of [NarrativeObservabilityService.priceAtOrAfter] — kept duplicated to keep services
   * independent. The lower-bound guard applies here too : a snapshot dated before the chart's
   * earliest bar is excluded from the calibration averages rather than skewed by a ~12-month
   * difference reported as « delta1d ».
   */
  private fun priceAtOrAfter(bars: List<OhlcBar>, target: LocalDate): BigDecimal? {
    if (bars.isEmpty()) return null
    val firstDate = bars.first().timestamp.atOffset(ZoneOffset.UTC).toLocalDate()
    if (target.isBefore(firstDate)) return null
    val bar = bars.firstOrNull { it.timestamp.atOffset(ZoneOffset.UTC).toLocalDate() >= target }
    return bar?.close
  }

  private fun delta(base: BigDecimal, future: BigDecimal?): BigDecimal? {
    if (future == null) return null
    if (base.signum() <= 0) return null
    return future.subtract(base).divide(base, SCALE, RoundingMode.HALF_UP)
  }

  /** Unzip a list of triples — Kotlin stdlib only ships [List.unzip] for pairs. */
  private fun <A, B, C> List<Triple<A, B, C>>.unzip3(): Triple<List<A>, List<B>, List<C>> {
    val first = ArrayList<A>(size)
    val second = ArrayList<B>(size)
    val third = ArrayList<C>(size)
    forEach {
      first.add(it.first)
      second.add(it.second)
      third.add(it.third)
    }
    return Triple(first, second, third)
  }

  companion object {
    private const val SCALE = 4
    private val BIAS_THRESHOLD = BigDecimal("0.6000")
    private const val TOP_N_TOPICS = 15
    private const val MIN_TOKEN_LENGTH = 3
    // Letter then any alphanumerics — so common financial tokens like "ma200" / "rsi62" survive
    // tokenisation. The leading-letter constraint drops bare numbers like "62" or "2026".
    private val TOKEN_REGEX = Regex("[a-z][a-z0-9]*")

    /**
     * English stopwords intentionally — the LLM emits its key_points in English (cf. the narrative
     * prompt). We don't try to handle French ; if an Ollama local model ever produced FR tokens
     * they'd bleed through but the user would still see the noise and could ignore the row.
     *
     * The list is conservative : common English particles + financial filler words that add no
     * signal (« stock », « price », « level »…). We keep informative-looking financial terms (« rsi
     * », « ma200 », « volatility ») precisely because the page is meant to surface them.
     */
    private val STOPWORDS =
      setOf(
        // Articles + conjunctions + prepositions
        "the",
        "and",
        "for",
        "with",
        "from",
        "into",
        "onto",
        "this",
        "that",
        "these",
        "those",
        "have",
        "has",
        "had",
        "are",
        "was",
        "were",
        "been",
        "being",
        "but",
        "not",
        "any",
        "all",
        "some",
        "such",
        "than",
        "then",
        "when",
        "where",
        "while",
        "during",
        "after",
        "before",
        "between",
        "above",
        "below",
        "over",
        "under",
        "near",
        "off",
        "out",
        // Pronouns + auxiliary verbs
        "its",
        "their",
        "his",
        "her",
        "you",
        "your",
        "our",
        "she",
        "him",
        "them",
        // Filler verbs / generic
        "see",
        "show",
        "shows",
        "showing",
        "look",
        "looking",
        "seem",
        "seems",
        "very",
        "much",
        "many",
        "more",
        "most",
        "less",
        "least",
        "still",
        "just",
        "yet",
        "now",
        // Generic financial filler — strip these so they don't crowd out real signal
        "stock",
        "price",
        "level",
        "levels",
        "value",
        "values",
        "trend",
        "trends",
        "side",
        "current",
        "currently",
        "recent",
        "recently",
      )
  }
}
