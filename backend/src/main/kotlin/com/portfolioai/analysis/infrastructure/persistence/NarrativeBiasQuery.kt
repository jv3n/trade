package com.portfolioai.analysis.infrastructure.persistence

import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import java.math.BigDecimal
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Component

/**
 * Phase 3 #3 — native SQL aggregations backing the « narrative bias » dashboard. Three SELECTs in
 * one round-trip per dimension :
 *
 * - **Sentiment distribution** — `GROUP BY sentiment` ; the page renders a horizontal bar chart and
 *   flags any bucket above [BIAS_THRESHOLD] (60 %) as suspicious.
 * - **Thumbs distribution by sentiment** — JOIN LATERAL on the latest `prompt_score` per snapshot
 *   (one snapshot can have multiple score rows after retries ; we take the most recent thumbs the
 *   user cast). Lets the page surface « do I systematically thumb-up BULLISH narratives ? » as a
 *   user-side bias check, complementing the LLM-side checks.
 * - **Raw snapshot rows** for client-side enrichment — symbol + generatedAt + sentiment + price +
 *   key_points_json. The service layer fetches the chart per unique symbol (cache-friendly via
 *   Caffeine) and computes calibration deltas + topic frequencies in Kotlin. We don't try to do
 *   either in SQL : (a) the chart isn't in Postgres, (b) tokenizing key_points + filtering
 *   stopwords + counting in SQL is brittle compared to plain Kotlin.
 *
 * **Filters** — `from / to / promptId` mirror the timeline endpoint exactly so the bias page
 * inherits the filter UI verbatim. `from inclusive, to exclusive` ; `promptId` excludes snapshots
 * with a null `prompt_template_id` (legacy / fallback path) when set.
 *
 * **Cap** — the raw snapshot SELECT is bounded to [MAX_RAW_ROWS] to keep the JSON payload sane and
 * the per-symbol chart fan-out predictable. The aggregations themselves are unbounded (a `COUNT`
 * over a 5k-row table is fine).
 */
@Component
class NarrativeBiasQuery(@PersistenceContext private val em: EntityManager) {

  /**
   * `GROUP BY sentiment` count. Returns one row per distinct sentiment (zero rows when the filter
   * window is empty — the service builds an explicit `BULLISH/NEUTRAL/BEARISH` zero-padded
   * distribution from this).
   */
  fun sentimentCounts(
    from: Instant? = null,
    to: Instant? = null,
    promptTemplateId: UUID? = null,
  ): List<SentimentCountRow> {
    val (whereClause, params) = buildFilters(from, to, promptTemplateId)
    val sql =
      """
      SELECT sentiment, COUNT(*) AS c
      FROM ticker_narrative_snapshot
      $whereClause
      GROUP BY sentiment
      """
        .trimIndent()
    val q = em.createNativeQuery(sql)
    params.forEach { (k, v) -> q.setParameter(k, v) }

    @Suppress("UNCHECKED_CAST") val rows = q.resultList as List<Array<*>>
    return rows.map {
      SentimentCountRow(sentiment = it[0] as String, count = (it[1] as Number).toLong())
    }
  }

  /**
   * Thumbs distribution split by snapshot sentiment. LATERAL takes the most recent `prompt_score`
   * row per snapshot (the same shape as the observability timeline), then aggregates by sentiment ×
   * thumbs value. Snapshots with no `prompt_score` row at all (fallback path / pre-PR2 history) are
   * surfaced as `noVote` via the `is null` branch.
   */
  fun thumbsBySentiment(
    from: Instant? = null,
    to: Instant? = null,
    promptTemplateId: UUID? = null,
  ): List<ThumbsBySentimentRow> {
    val (whereClause, params) = buildFilters(from, to, promptTemplateId, snapshotAlias = "s")
    val sql =
      """
      SELECT
        s.sentiment,
        SUM(CASE WHEN ps.user_thumbs = 1 THEN 1 ELSE 0 END)  AS up,
        SUM(CASE WHEN ps.user_thumbs = 0 THEN 1 ELSE 0 END)  AS neutral,
        SUM(CASE WHEN ps.user_thumbs = -1 THEN 1 ELSE 0 END) AS down,
        SUM(CASE WHEN ps.user_thumbs IS NULL THEN 1 ELSE 0 END) AS no_vote
      FROM ticker_narrative_snapshot s
      LEFT JOIN LATERAL (
        SELECT user_thumbs
        FROM prompt_score
        WHERE snapshot_id = s.id
        ORDER BY created_at DESC
        LIMIT 1
      ) ps ON TRUE
      $whereClause
      GROUP BY s.sentiment
      """
        .trimIndent()
    val q = em.createNativeQuery(sql)
    params.forEach { (k, v) -> q.setParameter(k, v) }

    @Suppress("UNCHECKED_CAST") val rows = q.resultList as List<Array<*>>
    return rows.map {
      ThumbsBySentimentRow(
        sentiment = it[0] as String,
        thumbsUp = (it[1] as Number).toLong(),
        thumbsNeutral = (it[2] as Number).toLong(),
        thumbsDown = (it[3] as Number).toLong(),
        noVote = (it[4] as Number).toLong(),
      )
    }
  }

  /**
   * Raw snapshot rows used by the service to compute (a) calibration (delta vs price afterwards,
   * grouped by sentiment) and (b) topic coverage (key_points tokenisation). Capped at
   * [MAX_RAW_ROWS] — beyond that, the per-symbol chart fan-out gets expensive and the topic
   * histogram saturates anyway.
   */
  fun rawSnapshots(
    from: Instant? = null,
    to: Instant? = null,
    promptTemplateId: UUID? = null,
  ): List<BiasSnapshotRow> {
    val (whereClause, params) = buildFilters(from, to, promptTemplateId)
    val sql =
      """
      SELECT id, symbol, generated_at, sentiment, price, key_points_json
      FROM ticker_narrative_snapshot
      $whereClause
      ORDER BY generated_at DESC
      LIMIT $MAX_RAW_ROWS
      """
        .trimIndent()
    val q = em.createNativeQuery(sql)
    params.forEach { (k, v) -> q.setParameter(k, v) }

    @Suppress("UNCHECKED_CAST") val rows = q.resultList as List<Array<*>>
    return rows.map {
      BiasSnapshotRow(
        snapshotId = it[0] as UUID,
        symbol = it[1] as String,
        generatedAt = normalizeInstant(it[2]),
        sentiment = it[3] as String,
        price = it[4] as BigDecimal,
        // JSONB roundtrip — same defensive `.toString()` as the timeline query (PG JDBC may
        // surface `PGobject` or plain `String` depending on driver version).
        keyPointsJson = it[5].toString(),
      )
    }
  }

  /**
   * Builds the parameterised `WHERE` clause shared by all three queries — keeps the filter
   * semantics in one place. [snapshotAlias] is the table alias prefix for the `s.col` form used by
   * the join query ; the unaliased queries pass `null` and get bare column references.
   */
  private fun buildFilters(
    from: Instant?,
    to: Instant?,
    promptTemplateId: UUID?,
    snapshotAlias: String? = null,
  ): Pair<String, Map<String, Any>> {
    val prefix = snapshotAlias?.let { "$it." } ?: ""
    val conditions = mutableListOf<String>()
    val params = mutableMapOf<String, Any>()
    if (from != null) {
      conditions.add("${prefix}generated_at >= :fromTs")
      params["fromTs"] = Timestamp.from(from)
    }
    if (to != null) {
      conditions.add("${prefix}generated_at < :toTs")
      params["toTs"] = Timestamp.from(to)
    }
    if (promptTemplateId != null) {
      conditions.add("${prefix}prompt_template_id = :promptTemplateId")
      params["promptTemplateId"] = promptTemplateId
    }
    val whereClause = if (conditions.isEmpty()) "" else "WHERE " + conditions.joinToString(" AND ")
    return whereClause to params
  }

  private fun normalizeInstant(value: Any?): Instant {
    return when (value) {
      is Instant -> value
      is Timestamp -> value.toInstant()
      else -> Instant.parse(value.toString())
    }
  }

  companion object {
    /**
     * Hard cap on the raw snapshot select. Above this we'd pay too much chart fan-out for
     * calibration and the topic histogram saturates ; the user can always tighten the date range
     * filter to keep the count bounded.
     */
    private const val MAX_RAW_ROWS = 2000
  }
}

/** One row of the `GROUP BY sentiment` count over the snapshot table. */
data class SentimentCountRow(val sentiment: String, val count: Long)

/**
 * Thumbs aggregate for one sentiment bucket. The four counts sum to the total snapshots in that
 * bucket within the filter window.
 */
data class ThumbsBySentimentRow(
  val sentiment: String,
  val thumbsUp: Long,
  val thumbsNeutral: Long,
  val thumbsDown: Long,
  val noVote: Long,
)

/**
 * Raw row used downstream for calibration + topic coverage. Carries only what the service needs ;
 * we deliberately don't fetch `summary` or `model_used` here because neither is consumed.
 */
data class BiasSnapshotRow(
  val snapshotId: UUID,
  val symbol: String,
  val generatedAt: Instant,
  val sentiment: String,
  val price: BigDecimal,
  val keyPointsJson: String,
)
