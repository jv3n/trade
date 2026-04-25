package com.portfolioai.portfolio.application.dto

import com.portfolioai.portfolio.domain.Portfolio
import java.time.Instant
import java.util.UUID

data class PortfolioDto(
    val id: UUID,
    val name: String,
    val description: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val assetCount: Int
)

fun Portfolio.toDto() = PortfolioDto(
    id = id,
    name = name,
    description = description,
    createdAt = createdAt,
    updatedAt = updatedAt,
    assetCount = assets.size
)
