package com.portfolioai.account.domain

import java.time.LocalDate

/**
 * Filter criteria for the movements listing. All fields optional — null = no filter. Mirrors
 * `TradeEntryFilter` on the journal side so both listings speak the same language : the front
 * resolves its period presets to a `dateFrom` / `dateTo` pair and sends dates, never preset names.
 *
 * [types] is a list rather than a single value so the "deposits / withdrawals" choice of the
 * account page maps to one request.
 */
data class AccountMovementFilter(
  val dateFrom: LocalDate? = null,
  val dateTo: LocalDate? = null,
  val types: List<AccountMovementType>? = null,
) {
  fun matches(movement: AccountMovement): Boolean =
    covers(movement.valueDate) && (types.isNullOrEmpty() || movement.type in types)

  fun covers(date: LocalDate): Boolean =
    (dateFrom == null || !date.isBefore(dateFrom)) && (dateTo == null || !date.isAfter(dateTo))
}
