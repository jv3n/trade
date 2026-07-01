package com.portfolioai.journal.application.dto

import com.portfolioai.journal.domain.ExecutionKind
import com.portfolioai.journal.domain.TradeExecution
import java.math.BigDecimal

/** Response shape for a single [TradeExecution]. Ordered by [seq] within its parent position. */
data class ExecutionDto(
  val seq: Int,
  val kind: ExecutionKind,
  val shares: Int,
  val price: BigDecimal,
)

fun TradeExecution.toDto() = ExecutionDto(seq = seq, kind = kind, shares = shares, price = price)
