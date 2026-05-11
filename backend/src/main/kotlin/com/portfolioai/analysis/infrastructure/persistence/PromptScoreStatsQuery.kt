package com.portfolioai.analysis.infrastructure.persistence

import com.portfolioai.analysis.application.dto.DailyBucket
import com.portfolioai.analysis.application.dto.PromptStatsDto
import com.portfolioai.analysis.application.dto.ThumbsDistribution
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import java.sql.Date as SqlDate
import java.util.UUID
import org.springframework.stereotype.Component

/**
 * Native-SQL query helper for the Phase 3 PR6 stats endpoint. Lives outside [PromptScoreRepository]
 * because the percentile + date-bucketing logic relies on PostgreSQL-specific functions
 * (`percentile_cont(...) WITHIN GROUP (...)`, `DATE_TRUNC('day', ...)`) that JPQL doesn't model —
 * keeping the repository pure Spring Data + extracting the bespoke query keeps both surfaces
 * coherent.
 *
 * Two single-round-trip queries :
 *
 * 1. **Global aggregate** — one row with totals, p50, p95, retry/parse/validator rates, thumbs
 *    distribution. Computed in a single `SELECT` so the DB does the work, not the JVM.
 * 2. **Daily series** — one row per day with runs / latency p50 / thumbs polarity. Capped at the
 *    last 90 days so the response stays bounded even on a hot prompt with thousands of runs. The
 *    frontend renders gaps for missing days (no zero-fill needed server-side).
 */
@Component
class PromptScoreStatsQuery(@PersistenceContext private val em: EntityManager) {

  fun aggregate(promptTemplateId: UUID): PromptStatsDto {
    val global = loadGlobal(promptTemplateId)
    val daily = loadDaily(promptTemplateId)
    return global.copy(daily = daily)
  }

  // ----------------------------------------------------------- global aggregate (single row)

  private fun loadGlobal(promptTemplateId: UUID): PromptStatsDto {
    val sql =
      """
      SELECT
        COUNT(*) AS total_runs,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
        SUM(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) AS retry_count,
        SUM(CASE WHEN parse_failed THEN 1 ELSE 0 END) AS parse_failed_count,
        SUM(CASE WHEN validator_failed THEN 1 ELSE 0 END) AS validator_failed_count,
        SUM(CASE WHEN user_thumbs = 1 THEN 1 ELSE 0 END) AS thumbs_up,
        SUM(CASE WHEN user_thumbs = -1 THEN 1 ELSE 0 END) AS thumbs_down,
        SUM(CASE WHEN user_thumbs = 0 THEN 1 ELSE 0 END) AS thumbs_neutral
      FROM prompt_score
      WHERE prompt_template_id = :promptTemplateId
      """
        .trimIndent()
    val row =
      em.createNativeQuery(sql).setParameter("promptTemplateId", promptTemplateId).singleResult
        as Array<*>
    val total = (row[0] as Number).toInt()
    val p50 = (row[1] as Number?)?.toDouble()?.let { it.toInt() }
    val p95 = (row[2] as Number?)?.toDouble()?.let { it.toInt() }
    val retries = (row[3] as Number?)?.toInt() ?: 0
    val parseFailed = (row[4] as Number?)?.toInt() ?: 0
    val validatorFailed = (row[5] as Number?)?.toInt() ?: 0
    val up = (row[6] as Number?)?.toInt() ?: 0
    val down = (row[7] as Number?)?.toInt() ?: 0
    val neutral = (row[8] as Number?)?.toInt() ?: 0
    val totalOrOne = if (total == 0) 1 else total // avoid /0, the rates stay at 0 when total=0
    return PromptStatsDto(
      promptTemplateId = promptTemplateId,
      totalRuns = total,
      latencyP50Ms = p50,
      latencyP95Ms = p95,
      retryRate = if (total == 0) 0.0 else retries.toDouble() / totalOrOne,
      parseFailedRate = if (total == 0) 0.0 else parseFailed.toDouble() / totalOrOne,
      validatorFailedRate = if (total == 0) 0.0 else validatorFailed.toDouble() / totalOrOne,
      thumbs = ThumbsDistribution(up = up, down = down, neutral = neutral),
      daily = emptyList(), // filled by [aggregate]
    )
  }

  // ----------------------------------------------------------- daily series (per-day bucket)

  private fun loadDaily(promptTemplateId: UUID): List<DailyBucket> {
    val sql =
      """
      SELECT
        DATE_TRUNC('day', created_at) AS day,
        COUNT(*) AS runs,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
        SUM(CASE WHEN user_thumbs = 1 THEN 1 ELSE 0 END) AS up,
        SUM(CASE WHEN user_thumbs = -1 THEN 1 ELSE 0 END) AS down
      FROM prompt_score
      WHERE prompt_template_id = :promptTemplateId
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day DESC
      """
        .trimIndent()
    @Suppress("UNCHECKED_CAST")
    val rows =
      em.createNativeQuery(sql).setParameter("promptTemplateId", promptTemplateId).resultList
        as List<Array<*>>
    return rows.map { row ->
      // PostgreSQL returns `DATE_TRUNC('day', ts)` as a `timestamp`, Hibernate maps it to either
      // `java.sql.Timestamp` (timestamp with tz off) or `java.time.Instant` depending on driver
      // version. Normalize via toString().take(10) to land on `YYYY-MM-DD` then parse.
      val dayAny = row[0]
      val day =
        when (dayAny) {
          is java.time.LocalDate -> dayAny
          is SqlDate -> dayAny.toLocalDate()
          is java.sql.Timestamp -> dayAny.toLocalDateTime().toLocalDate()
          is java.time.Instant -> dayAny.atZone(java.time.ZoneOffset.UTC).toLocalDate()
          else -> java.time.LocalDate.parse(dayAny.toString().take(10))
        }
      DailyBucket(
        day = day,
        runs = (row[1] as Number).toInt(),
        latencyP50Ms = (row[2] as Number?)?.toDouble()?.toInt(),
        thumbsUp = (row[3] as Number?)?.toInt() ?: 0,
        thumbsDown = (row[4] as Number?)?.toInt() ?: 0,
      )
    }
  }
}
