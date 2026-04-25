package com.portfolioai.portfolio.domain

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

    /** Devise native de l'actif (USD, CAD…) */
    @Column(nullable = false, length = 10)
    var currency: String = "CAD",

    /** Valeur comptable en CAD — toujours comparable entre actifs */
    @Column(name = "book_value_cad", nullable = false, precision = 18, scale = 2)
    var bookValueCad: BigDecimal = BigDecimal.ZERO,

    /** Valeur marchande actuelle en devise native */
    @Column(name = "market_value", nullable = false, precision = 18, scale = 4)
    var marketValue: BigDecimal = BigDecimal.ZERO,

    /** Rendements non réalisés du marché */
    @Column(name = "unrealized_gain", precision = 18, scale = 4)
    var unrealizedGain: BigDecimal? = null,

    @Column(name = "gain_currency", length = 10)
    var gainCurrency: String? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)
