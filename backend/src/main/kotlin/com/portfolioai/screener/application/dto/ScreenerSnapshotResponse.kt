package com.portfolioai.screener.application.dto

import java.time.Instant
import java.time.LocalDate

/**
 * REST envelope for one screener snapshot — the payload returned by both `POST
 * /api/screener/refresh` (fresh fetch + persist) and `GET /api/screener/movers` (latest persisted,
 * optionally by date).
 *
 * Shape designed so the same DTO covers the "no snapshot yet" empty state : when the user has never
 * pressed « Rechercher » for the active provider, [date] and [fetchedAt] are `null` and [movers] is
 * empty — the UI renders the "press Rechercher to amorcer" hint without needing a 204 / null body
 * special case.
 *
 * The dynamic filter (gap %, volume ratio, cap range, exchange, sector) is **not** applied here —
 * the frontend filters the raw [movers] list in-process so quota-bound providers (FMP 250 req/jour)
 * aren't burned on every panel tweak. See Phase 6 ticket (9) for the design call.
 */
data class ScreenerSnapshotResponse(
  /**
   * Snapshot date (ET market day). `null` when no snapshot has been persisted yet for [provider].
   */
  val date: LocalDate?,
  /** Active screener provider when the snapshot was fetched — `mock` / `polygon` / `fmp`. */
  val provider: String,
  /** When the refresh was persisted. `null` when no snapshot exists yet. */
  val fetchedAt: Instant?,
  /** Raw movers list from the provider — filter is applied client-side. Empty when no snapshot. */
  val movers: List<TickerMoverDto>,
)
