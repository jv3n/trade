package com.portfolioai.forex.domain

import java.math.BigDecimal
import java.time.LocalDate

/**
 * A single foreign-exchange reference rate : 1 [base] = [rate] [quote], as published on [asOf].
 *
 * Read-only — sourced from an upstream provider (ECB reference rates via Frankfurter today), never
 * persisted. The account page uses it to display the USD balance converted to another currency ;
 * the multiplication itself happens client-side, the backend only vends the rate.
 */
data class ForexRate(val base: String, val quote: String, val rate: BigDecimal, val asOf: LocalDate)
