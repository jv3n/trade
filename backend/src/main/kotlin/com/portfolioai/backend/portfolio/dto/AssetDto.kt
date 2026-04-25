package com.portfolioai.backend.portfolio.dto

import com.portfolioai.backend.portfolio.Asset
import com.portfolioai.backend.portfolio.AssetType
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
    /** Devise native (USD, CAD…) */
    val currency: String,
    /** Valeur comptable en CAD — comparable entre actifs de devises différentes */
    val bookValueCad: BigDecimal,
    /** Valeur marchande actuelle en devise native */
    val marketValue: BigDecimal,
    /** Prix de marché unitaire = marketValue / quantity */
    val marketPrice: BigDecimal,
    /** Rendements non réalisés du marché */
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
