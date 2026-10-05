package com.portfolioai.locate.application

import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

/**
 * Published by [LocateService] after a locate is created, updated or deleted, so the `account`
 * context can keep its `LOCATE` movement in step (#606) — consumed synchronously, in the same
 * transaction. On create / update the locate is flushed first ; on deletion the event fires before
 * the row goes. [candidateId] lets the account's `LOCATE` line link to the candidate (#608).
 */
data class LocateChangedEvent(
  val locateId: UUID,
  val userId: UUID,
  val ticker: String,
  val tradingDate: LocalDate,
  val shares: Int,
  val cost: BigDecimal,
  val candidateId: UUID?,
  val deleted: Boolean,
)
