package com.portfolioai.portfolio.application.dto

import com.portfolioai.portfolio.domain.Portfolio
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class PortfolioDto(
  val id: UUID,
  val name: String,
  val description: String?,
  val createdAt: Instant,
  val updatedAt: Instant,
  val assetCount: Int,
  /**
   * Sum of [com.portfolioai.portfolio.domain.Asset.bookValueCad] across all assets, in CAD. Always
   * in CAD regardless of position currency, so cross-portfolio totals are comparable.
   */
  val totalBookValueCad: BigDecimal,
)

fun Portfolio.toDto() =
  PortfolioDto(
    id = id,
    name = name,
    description = description,
    createdAt = createdAt,
    updatedAt = updatedAt,
    assetCount = assets.size,
    totalBookValueCad = assets.sumOf { it.bookValueCad },
  )
