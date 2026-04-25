package com.portfolioai.portfolio.application.dto

import com.portfolioai.portfolio.domain.SnapshotPosition
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class SnapshotSummaryDto(
  val id: UUID,
  val batchId: UUID,
  val portfolioId: UUID,
  val portfolioName: String,
  val importedAt: Instant,
  val positionCount: Int,
  val totalBookValueCad: BigDecimal,
)

data class SnapshotPositionDto(
  val ticker: String,
  val name: String,
  val assetType: String,
  val quantity: BigDecimal,
  val bookValueCad: BigDecimal,
  val marketValue: BigDecimal,
  val marketCurrency: String,
  val unrealizedGain: BigDecimal?,
  val gainCurrency: String?,
)

fun SnapshotPosition.toDto() =
  SnapshotPositionDto(
    ticker = ticker,
    name = name,
    assetType = assetType.name,
    quantity = quantity,
    bookValueCad = bookValueCad,
    marketValue = marketValue,
    marketCurrency = marketCurrency,
    unrealizedGain = unrealizedGain,
    gainCurrency = gainCurrency,
  )
