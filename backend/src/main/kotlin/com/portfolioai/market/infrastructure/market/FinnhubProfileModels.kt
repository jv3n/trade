package com.portfolioai.market.infrastructure.market

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

/**
 * Wire shape for Finnhub `/stock/profile2`. Reference :
 * https://finnhub.io/docs/api/company-profile2
 *
 * Quirks :
 * - **Free tier covers this endpoint** (unlike Twelve Data `/profile` which is paid-tier only — the
 *   original reason we replaced the Twelve Data sector adapter with this one).
 * - The category lives on `finnhubIndustry` (their own taxonomy, mostly aligned with GICS but with
 *   variations like "Financial Services" / "Health Care" that we already absorb via
 *   [SpdrSectorEtfs] synonyms).
 * - Symbols Finnhub doesn't cover return an **empty JSON object** `{}` (HTTP 200) rather than a 404
 *   — the adapter inspects `ticker.isNullOrBlank()` to detect this and throws
 *   [NoSuchElementException].
 * - `@JsonIgnoreProperties(ignoreUnknown = true)` because Finnhub adds fields we don't need
 *   (`country`, `currency`, `marketCapitalization`, `weburl`, `logo`, `phone`, `ipo`,
 *   `shareOutstanding`, `name`, `exchange`).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class FinnhubCompanyProfile(
  /** Echoed back by Finnhub. Empty / null when the symbol isn't covered. */
  val ticker: String?,
  /** Finnhub's industry category — drives the SPDR sector ETF lookup via [SpdrSectorEtfs]. */
  val finnhubIndustry: String?,
)
