package com.portfolioai.market.infrastructure.market

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty

/**
 * Jackson DTOs mirroring `GET /symbol_search` on Twelve Data. Documented at
 * https://twelvedata.com/docs#symbol-search.
 *
 * Cost : 1 credit per call (free tier 800 / day) — same envelope as `/quote` and `/time_series`.
 *
 * `@JsonIgnoreProperties(ignoreUnknown = true)` everywhere : Twelve Data adds fields silently
 * (`mic_code`, `country`, `instrument_type`, `exchange_timezone` …) and we only need a triplet for
 * the UI dropdown.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class TwelveDataSymbolSearchResponse(
  val data: List<TwelveDataSymbolSearchEntry>?,
  val status: String?,
  val code: Int?,
  val message: String?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class TwelveDataSymbolSearchEntry(
  val symbol: String?,
  /** Human-readable issuer name. Twelve Data uses this label rather than `name`. */
  @JsonProperty("instrument_name") val instrumentName: String?,
  val exchange: String?,
)
