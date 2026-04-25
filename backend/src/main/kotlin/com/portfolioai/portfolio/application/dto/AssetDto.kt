package com.portfolioai.portfolio.application.dto

import com.portfolioai.portfolio.domain.Asset
import com.portfolioai.portfolio.domain.AssetType
import java.math.BigDecimal
import java.math.RoundingMode
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
    val currency: String,
    val bookValueCad: BigDecimal,
    val marketValue: BigDecimal,
    val marketPrice: BigDecimal,
    val unrealizedGain: BigDecimal?,
    val gainCurrency: String?,
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
    currency = currency,
    bookValueCad = bookValueCad,
    marketValue = marketValue,
    marketPrice = if (quantity.signum() > 0)
        marketValue.divide(quantity, 4, RoundingMode.HALF_UP).abs()
    else BigDecimal.ZERO,
    unrealizedGain = unrealizedGain,
    gainCurrency = gainCurrency,
    createdAt = createdAt
)
