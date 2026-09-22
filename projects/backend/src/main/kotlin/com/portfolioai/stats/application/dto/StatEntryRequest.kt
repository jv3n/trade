package com.portfolioai.stats.application.dto

import com.portfolioai.shared.Pattern
import java.math.BigDecimal
import java.time.LocalDate

/**
 * Full payload of a stat — premarket block, session block and flags. Used by `PUT /api/stats/{id}`
 * — what the completion panel sends back after the 4 pm close.
 *
 * The premarket prices are required and positive, with [pmHigh] >= [pmOpen] ; the session prices
 * are optional (all absent = the stat stays "to complete") but each one must be positive, and
 * [hodPrice] >= [lodPrice] when both are in. Percentages are never sent : they are derived from the
 * prices. Validation is done in-service (a clean 400, not a DB CHECK hit).
 */
data class StatEntryRequest(
  val tradeDate: LocalDate,
  val pattern: Pattern = Pattern.GUS,
  val ticker: String,
  // ---- Premarket ----
  val previousClose: BigDecimal,
  val pmOpen: BigDecimal,
  val pmHigh: BigDecimal,
  val floatMillions: BigDecimal? = null,
  val volumeMillions: BigDecimal? = null,
  val locatePerShare: BigDecimal? = null,
  val note: String? = null,
  // ---- Session ----
  val openPrice: BigDecimal? = null,
  val pushOpenPrice: BigDecimal? = null,
  val hodPrice: BigDecimal? = null,
  val lodPrice: BigDecimal? = null,
  val eodPrice: BigDecimal? = null,
  // ---- Flags ----
  val ssr: Boolean = false,
  val under1Dollar: Boolean = false,
  val entryAfter11am: Boolean = false,
  /** The stock never pushed after the open — [pushOpenPrice] is then ignored and stored empty. */
  val noPush: Boolean = false,
  /** Less than 20 % of the float held by institutions (#349). */
  val lowInstitutions: Boolean = false,
)
