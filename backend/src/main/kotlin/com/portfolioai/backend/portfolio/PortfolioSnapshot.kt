package com.portfolioai.backend.portfolio

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "portfolio_snapshot")
class PortfolioSnapshot(
    @Id
    val id: UUID = UUID.randomUUID(),

    @Column(name = "batch_id", nullable = false)
    val batchId: UUID,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "portfolio_id", nullable = false)
    val portfolio: Portfolio,

    @Column(name = "imported_at", nullable = false, updatable = false)
    val importedAt: Instant = Instant.now(),

    @OneToMany(mappedBy = "snapshot", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    val positions: MutableList<SnapshotPosition> = mutableListOf()
)

@Entity
@Table(name = "snapshot_position")
class SnapshotPosition(
    @Id
    val id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "snapshot_id", nullable = false)
    val snapshot: PortfolioSnapshot,

    @Column(nullable = false, length = 20)
    val ticker: String,

    @Column(nullable = false)
    val name: String,

    @Enumerated(EnumType.STRING)
    @Column(name = "asset_type", nullable = false, length = 50)
    val assetType: AssetType,

    @Column(nullable = false, precision = 18, scale = 6)
    val quantity: BigDecimal,

    /** Valeur comptable (CAD) — toujours en CAD, comparable entre snapshots */
    @Column(name = "book_value_cad", nullable = false, precision = 18, scale = 2)
    val bookValueCad: BigDecimal,

    /** Valeur marchande — en devise native (USD ou CAD) */
    @Column(name = "market_value", nullable = false, precision = 18, scale = 4)
    val marketValue: BigDecimal,

    @Column(name = "market_currency", nullable = false, length = 10)
    val marketCurrency: String,

    /** Rendements non réalisés du marché */
    @Column(name = "unrealized_gain", precision = 18, scale = 4)
    val unrealizedGain: BigDecimal? = null,

    @Column(name = "gain_currency", length = 10)
    val gainCurrency: String? = null
)
