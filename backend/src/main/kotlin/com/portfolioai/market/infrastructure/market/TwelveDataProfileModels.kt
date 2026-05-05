package com.portfolioai.market.infrastructure.market

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

/**
 * Jackson DTO mirroring `GET /profile` on Twelve Data. Documented at
 * https://twelvedata.com/docs#profile.
 *
 * Cost : 1 credit per call (free tier 800 / day) — same envelope as `/quote` and `/symbol_search`.
 *
 * On the success path the response is the profile object itself (sector, industry, name…). On the
 * error path Twelve Data returns the unified envelope with `status: "error"` + `code` + `message`,
 * exactly like the chart and search endpoints — we deserialise into a single shape and inspect
 * `status` after the fact.
 *
 * `@JsonIgnoreProperties(ignoreUnknown = true)` because Twelve Data adds fields silently
 * (`employees`, `website`, `description`, `mic_code`, `country` …) and we only need the sector for
 * the SPDR mapping.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class TwelveDataProfileResponse(
  val symbol: String?,
  val name: String?,
  val sector: String?,
  val industry: String?,
  // Error-envelope fields — populated only when the upstream returned `status: "error"`.
  val status: String?,
  val code: Int?,
  val message: String?,
)
