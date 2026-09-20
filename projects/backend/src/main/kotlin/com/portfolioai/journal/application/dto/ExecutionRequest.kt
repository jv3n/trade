package com.portfolioai.journal.application.dto

import com.portfolioai.journal.domain.ExecutionKind
import java.math.BigDecimal
import java.time.LocalTime

/**
 * One execution leg in a [TradeEntryRequest]. The list order is the saisie order — the service
 * re-sequences it 0-based on persist. [shares] must be > 0 and [price] > 0 (validated in the
 * service before it reaches the DB CHECK constraints). [executedAt] is the fill time when the
 * broker statement gives one — optional, it only feeds the trade's duration.
 */
data class ExecutionRequest(
  val kind: ExecutionKind,
  val shares: Int,
  val price: BigDecimal,
  val executedAt: LocalTime? = null,
)
