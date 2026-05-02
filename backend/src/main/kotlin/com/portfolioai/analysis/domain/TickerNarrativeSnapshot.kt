package com.portfolioai.analysis.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

/**
 * Persisted output of one narrative LLM call. Frozen with the inputs that produced it
 * ([price] + [indicatorsJson]) so we can relire dans 6 mois ce que disait l'IA en regardant quoi —
 * see CLAUDE.md ("Snapshot du narratif systématique").
 *
 * `indicatorsJson` and `keyPointsJson` are stored as Postgres `JSONB` ; Hibernate maps them as
 * `String` thanks to `@JdbcTypeCode(SqlTypes.JSON)`. Marshalling to/from typed Kotlin objects is
 * the application layer's job — keeps Hibernate out of the JSON business.
 */
@Entity
@Table(name = "ticker_narrative_snapshot")
class TickerNarrativeSnapshot(
  @Id val id: UUID = UUID.randomUUID(),
  @Column(nullable = false, length = 20) val symbol: String,
  @Column(name = "generated_at", nullable = false) val generatedAt: Instant = Instant.now(),
  @Column(nullable = false) val price: BigDecimal,
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "indicators_json", nullable = false, columnDefinition = "jsonb")
  val indicatorsJson: String,
  @Column(nullable = false, columnDefinition = "text") val summary: String,
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10) val sentiment: Sentiment,
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "key_points_json", nullable = false, columnDefinition = "jsonb")
  val keyPointsJson: String,
  @Column(name = "model_used", nullable = false, length = 100) val modelUsed: String,
  @Column(name = "prompt_version", nullable = false, length = 50) val promptVersion: String = "v1",
)
