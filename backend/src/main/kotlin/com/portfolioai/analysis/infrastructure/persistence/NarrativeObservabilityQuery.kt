package com.portfolioai.analysis.infrastructure.persistence

import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import java.math.BigDecimal
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Component

/**
 * Native-SQL fetch for the Phase 3 #1 observability timeline. Single round-trip that joins :
 *
 * - `ticker_narrative_snapshot` — the historical narratives for [symbol], filtered by optional date
 *   range + optional `prompt_template_id`.
 * - `prompt_template` (LEFT JOIN, FK on snapshot is nullable) — exposes `name` + `version` so the
 *   page can filter / label « narratives from prompt v3 ».
 * - `prompt_score` (LEFT JOIN LATERAL, one snapshot can have at most one row in the normal flow but
 *   the lateral is defensive against the upsert path of PR5 which could land a second row) —
 *   exposes the user's latest `user_thumbs` so the page can colorize 👍/👎 next to the narrative.
 *
 * Lives outside [TickerNarrativeSnapshotRepository] because (a) the join + LATERAL semantics push
 * past what JPQL models cleanly, (b) the row shape is page-specific (we don't need the indicators
 * JSON blob — that one's only useful when re-running the prompt, which this page doesn't do), so a
 * dedicated query is leaner than fetching the entity and post-joining in the service. Mirrors the
 * [PromptScoreStatsQuery] pattern.
 *
 * **No pagination today** — capped at [MAX_ROWS] which covers ~3 years of daily narratives on a
 * single symbol (well above any realistic single-user volume). If we ever cross that threshold the
 * filter UI (date range) is the escape hatch.
 */
@Component
class NarrativeObservabilityQuery(@PersistenceContext private val em: EntityManager) {

  fun find(
    symbol: String,
    from: Instant? = null,
    to: Instant? = null,
    promptTemplateId: UUID? = null,
  ): List<NarrativeObservationRow> {
    val conditions = mutableListOf("s.symbol = :symbol")
    val params = mutableMapOf<String, Any>("symbol" to symbol)
    if (from != null) {
      conditions.add("s.generated_at >= :fromTs")
      params["fromTs"] = Timestamp.from(from)
    }
    if (to != null) {
      conditions.add("s.generated_at < :toTs")
      params["toTs"] = Timestamp.from(to)
    }
    if (promptTemplateId != null) {
      conditions.add("s.prompt_template_id = :promptTemplateId")
      params["promptTemplateId"] = promptTemplateId
    }
    val sql =
      """
      SELECT
        s.id,
        s.generated_at,
        s.price,
        s.summary,
        s.sentiment,
        s.key_points_json,
        s.model_used,
        s.prompt_version,
        s.prompt_template_id,
        pt.name AS prompt_name,
        pt.version AS prompt_template_version,
        ps.user_thumbs
      FROM ticker_narrative_snapshot s
      LEFT JOIN prompt_template pt ON pt.id = s.prompt_template_id
      LEFT JOIN LATERAL (
        SELECT user_thumbs
        FROM prompt_score
        WHERE snapshot_id = s.id
        ORDER BY created_at DESC
        LIMIT 1
      ) ps ON TRUE
      WHERE ${conditions.joinToString(" AND ")}
      ORDER BY s.generated_at DESC
      LIMIT $MAX_ROWS
      """
        .trimIndent()

    val query = em.createNativeQuery(sql)
    params.forEach { (k, v) -> query.setParameter(k, v) }

    @Suppress("UNCHECKED_CAST") val rows = query.resultList as List<Array<*>>
    return rows.map(::mapRow)
  }

  private fun mapRow(row: Array<*>): NarrativeObservationRow {
    return NarrativeObservationRow(
      snapshotId = row[0] as UUID,
      generatedAt = normalizeInstant(row[1]),
      price = row[2] as BigDecimal,
      summary = row[3] as String,
      sentiment = row[4] as String,
      // JSONB roundtrip — PG JDBC may surface `PGobject` (newer drivers) or plain `String` (older /
      // Hibernate-converted). Normalize via `toString()` which works on both.
      keyPointsJson = row[5].toString(),
      modelUsed = row[6] as String,
      promptVersion = row[7] as String,
      promptTemplateId = row[8] as UUID?,
      promptName = row[9] as String?,
      promptTemplateVersion = row[10] as String?,
      thumbsValue = (row[11] as Number?)?.toShort(),
    )
  }

  // Hibernate maps `TIMESTAMPTZ` to either `java.sql.Timestamp` or `java.time.Instant` depending on
  // driver version. Normalize so the row type carries a stable `Instant` regardless. Same trick as
  // [PromptScoreStatsQuery] does for `DATE_TRUNC` outputs.
  private fun normalizeInstant(value: Any?): Instant {
    return when (value) {
      is Instant -> value
      is Timestamp -> value.toInstant()
      else -> Instant.parse(value.toString())
    }
  }

  companion object {
    private const val MAX_ROWS = 500
  }
}

/**
 * Internal row shape returned by [NarrativeObservabilityQuery]. The service layer maps this into
 * the public [com.portfolioai.analysis.application.dto.NarrativeObservationDto] after enriching it
 * with the price-since deltas — keeping the deltas out of the SQL layer means the query stays a
 * pure DB read with no market-data dependency.
 */
data class NarrativeObservationRow(
  val snapshotId: UUID,
  val generatedAt: Instant,
  val price: BigDecimal,
  val summary: String,
  val sentiment: String,
  val keyPointsJson: String,
  val modelUsed: String,
  val promptVersion: String,
  val promptTemplateId: UUID?,
  val promptName: String?,
  val promptTemplateVersion: String?,
  val thumbsValue: Short?,
)
