package com.portfolioai.backend.portfolio

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

enum class AssetType { ETF, STOCK, COMMODITY, CRYPTO, BOND }

@Entity
@Table(name = "asset")
class Asset(
    @Id
    val id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "portfolio_id", nullable = false)
    val portfolio: Portfolio,

    @Column(nullable = false, length = 20)
    var ticker: String,

    @Column(nullable = false)
    var name: String,

    @Column(nullable = false, precision = 18, scale = 6)
    var quantity: BigDecimal,

    @Column(name = "avg_buy_price", nullable = false, precision = 18, scale = 4)
    var avgBuyPrice: BigDecimal,

    @Enumerated(EnumType.STRING)
    @Column(name = "asset_type", nullable = false, length = 50)
    var assetType: AssetType,

    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)
