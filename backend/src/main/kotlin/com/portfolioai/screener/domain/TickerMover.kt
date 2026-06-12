package com.portfolioai.screener.domain

import java.math.BigDecimal

/**
 * One row of the market radar — a ticker showing an abnormal move at the open. Provider-agnostic
 * shape : whether the data comes from Polygon, Finnhub, FMP or the mock, the radar table renders
 * the same columns.
 *
 * Two derived fields are pre-computed by the adapter (`gapPct`, `volumeRatio`) so the service +
 * controller never have to re-derive them from raw price / volume. Convention :
 * - `gapPct` = `(price - previousClose) / previousClose * 100` — signed percentage. Positive means
 *   the open price gapped up vs yesterday's close, negative means a gap down. The radar focuses on
 *   positive gaps (pump-and-dump precursor) but the field carries the sign so a future "gap-down"
 *   variant of the radar reuses the same shape.
 * - `volumeRatio` = `volume / volumeAvg30d` — how many times the current session volume exceeds the
 *   30-day average. A value of 5 means "5× the typical volume" which is the kind of disproportion
 *   we want to surface.
 *
 * **No prediction in this type** — `gapPct` and `volumeRatio` are *facts* read off the market, not
 * forecasts. The radar surfaces tickers worth investigating, not "this is going to dump". The
 * narrative comes from the dossier-ticker pipeline (Phase 1) when the user clicks through.
 */
data class TickerMover(
  val symbol: String,
  val name: String,
  val price: BigDecimal,
  val previousClose: BigDecimal,
  /** Signed percentage — positive for a gap-up, negative for a gap-down. See class KDoc. */
  val gapPct: BigDecimal,
  val volume: Long,
  val volumeAvg30d: Long,
  /** Multiple of the 30-day average volume. 1.0 = normal, 5.0 = five times. See class KDoc. */
  val volumeRatio: BigDecimal,
  val marketCapUsd: Long,
  val exchange: String,
  /** Nullable because some adapters / symbols don't carry sector metadata. */
  val sector: String?,
  /**
   * Free-float shares (not total shares outstanding). The GUS entry checklist targets a 3M–50M
   * float. Nullable: only the mock supplies it today; the live gainers endpoints (FMP / Polygon)
   * don't carry float, so the radar's float filter passes a null row through (null = "unknown,
   * don't reject"). Populated post-snapshot from a secondary provider call
   * ([TickerFundamentalsClient]).
   */
  val floatShares: Long? = null,
  /**
   * Premarket session volume (shares). Nullable: the gainers endpoints don't carry it, so it's
   * filled by the post-snapshot enrichment step when the provider exposes it, else stays null.
   * Shown on the radar, not filtered.
   */
  val premarketVolume: Long? = null,
)
