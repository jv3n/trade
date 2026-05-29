package com.portfolioai.screener.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.IdClass
import jakarta.persistence.Table
import java.io.Serializable
import java.time.Instant
import java.time.LocalDate
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

/**
 * One persisted screener snapshot — the raw output of the active provider at the moment the user
 * pressed « Rechercher ». One row per `(date, provider)` ; subsequent refreshes the same day UPSERT
 * the existing row (single-user, no need to keep intra-day history).
 *
 * `moversJson` carries a Jackson-serialised `List<TickerMoverDto>` (string round-trip via
 * `@JdbcTypeCode(SqlTypes.JSON)` — same convention as
 * [com.portfolioai.analysis.domain.TickerNarrativeSnapshot.indicatorsJson]). The dynamic filter
 * (gap %, volume ratio, cap range, exchange, sector) is applied **after** unmarshalling, never
 * persisted — keeping the raw payload lets ticket (8) « resserrer la cible » tweak thresholds
 * without re-fetching.
 *
 * `provider` matches `ConfigKeys.PROVIDER_*` (`mock` / `polygon` / `fmp`) — string, not enum, so a
 * new provider doesn't trigger a migration.
 */
@Entity
@Table(name = "screener_snapshot_day")
@IdClass(ScreenerSnapshotDayId::class)
class ScreenerSnapshotDay(
  @Id @Column(nullable = false) val date: LocalDate,
  @Id @Column(nullable = false, length = 20) val provider: String,
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "movers", nullable = false, columnDefinition = "jsonb")
  val moversJson: String,
  @Column(name = "fetched_at", nullable = false) val fetchedAt: Instant = Instant.now(),
)

/**
 * Composite-key holder for [ScreenerSnapshotDay]. Required by JPA `@IdClass` ; not surfaced outside
 * the persistence boundary — service-layer callers pass `date` + `provider` as separate arguments.
 */
data class ScreenerSnapshotDayId(val date: LocalDate = LocalDate.MIN, val provider: String = "") :
  Serializable
