package com.portfolioai.screener.infrastructure.screener

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

/**
 * Response DTOs for the FMP enrichment calls used by [FmpTickerFundamentalsClient]. Both endpoints
 * return a single-element **JSON array**. Unknown fields are ignored (these payloads carry many
 * fields we don't need), per the convention shared with [FmpMoverEntry].
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class FmpSharesFloat(
  /** Free-float shares for the symbol — the GUS 3M–50M criterion. */
  val floatShares: Long? = null
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class FmpQuote(
  /** Cumulative session volume — a premarket-volume proxy when polled during the premarket. */
  val volume: Long? = null
)
