package com.portfolioai.market.domain

/**
 * Allowed timeframes for the multi-timeframe chart toggle on the dossier ticker. Each entry maps a
 * stable frontend [code] to a provider-neutral pair [range] + [interval] that
 * [com.portfolioai.market.domain.MarketChartClient] can consume.
 *
 * Why an enum rather than free-form strings :
 * - **Whitelist by construction** — the controller can only accept a known [code], no risk of
 *   garbage values polluting the cache key (the Caffeine cache keys on `range|interval`).
 * - **Single source of truth** for the (range, interval) combo per timeframe — the front never
 *   sends both, just the code, and the backend translates.
 * - **Extension point** — adding a `6M` or `MAX` timeframe is a one-line enum entry.
 *
 * Note on indicators : these timeframes only drive the **chart** display. Indicators and the LLM
 * narrative stay anchored on `ONE_YEAR` (the dossier's reference view) — recomputing them per
 * timeframe would change their semantic meaning every click and burn LLM credits.
 */
enum class Timeframe(val code: String, val range: String, val interval: String) {
  // Intervals are Yahoo-style (`5m` / `30m` / `1d` / `1wk`). Adapters translate to their own
  // upstream format (TwelveDataClient.mapInterval). This alignment matters because the Caffeine
  // cache keys on the *raw* range/interval — using `1day` here would create a sibling cache
  // entry from the dossier's `1d` for the same upstream call, doubling Twelve Data credits.
  ONE_DAY("1d", "1d", "5m"),
  FIVE_DAYS("5d", "5d", "30m"),
  ONE_MONTH("1mo", "1mo", "1d"),
  THREE_MONTHS("3mo", "3mo", "1d"),
  ONE_YEAR("1y", "1y", "1d"),
  FIVE_YEARS("5y", "5y", "1wk");

  companion object {
    /** Resolve a frontend [code] to a [Timeframe]. Throws [IllegalArgumentException] on unknown. */
    fun fromCode(code: String): Timeframe =
      entries.firstOrNull { it.code == code }
        ?: throw IllegalArgumentException(
          "Unknown timeframe '$code' — allowed values : ${entries.joinToString(", ") { it.code }}"
        )
  }
}
