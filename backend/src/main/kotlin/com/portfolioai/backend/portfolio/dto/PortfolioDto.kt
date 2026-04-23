package com.portfolioai.backend.portfolio.dto

import com.portfolioai.backend.portfolio.Portfolio
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

data class CreatePortfolioRequest(
    val name: String,
    val description: String? = null
)

fun Portfolio.toDto() = PortfolioDto(
    id = id,
    name = name,
    description = description,
    createdAt = createdAt,
    updatedAt = updatedAt,
    assetCount = assets.size
)
