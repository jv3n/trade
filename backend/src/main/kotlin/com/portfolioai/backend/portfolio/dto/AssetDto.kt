package com.portfolioai.backend.portfolio.dto

import com.portfolioai.backend.portfolio.Asset
import com.portfolioai.backend.portfolio.AssetType
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class AssetDto(
    val id: UUID,
    val portfolioId: UUID,
    val ticker: String,
    val name: String,
    val quantity: BigDecimal,
    val avgBuyPrice: BigDecimal,
    val assetType: AssetType,
    val totalValue: BigDecimal,
    val createdAt: Instant
)

fun Asset.toDto() = AssetDto(
    id = id,
    portfolioId = portfolio.id,
    ticker = ticker,
    name = name,
    quantity = quantity,
    avgBuyPrice = avgBuyPrice,
    assetType = assetType,
    totalValue = quantity.multiply(avgBuyPrice),
    createdAt = createdAt
)
