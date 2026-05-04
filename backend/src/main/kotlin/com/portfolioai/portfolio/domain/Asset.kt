package com.portfolioai.portfolio.domain

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

enum class AssetType {
  ETF,
  STOCK,
  COMMODITY,
  CRYPTO,
  BOND,
}

/**
 * Lifecycle d'une position dans un portefeuille.
 * - [OPEN] : position détenue à ce jour. C'est l'état des rows présentes dans le dernier import
 *   CSV.
 * - [CLOSED] : position soldée — n'apparaît plus dans le dernier import. Les valeurs (`quantity`,
 *   `marketValue`, …) sont figées à la dernière snapshot connue ; le `closedAt` porte la date de
 *   l'import qui a détecté la fermeture. Si la position réapparaît plus tard (rachat), elle est
 *   réouverte (`status = OPEN`, `closedAt = null`).
 *
 * Le filtrage des vues "live" (dashboard, owned-tickers) se fait sur `status = OPEN` ; les
 * snapshots [com.portfolioai.portfolio.domain.PortfolioSnapshot] continuent de capturer
 * l'historique exact par batch, indépendamment de ce statut.
 */
enum class AssetStatus {
  OPEN,
  CLOSED,
}

@Entity
@Table(name = "asset")
class Asset(
  @Id val id: UUID = UUID.randomUUID(),
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "portfolio_id", nullable = false)
  val portfolio: Portfolio,
  @Column(nullable = false, length = 20) var ticker: String,
  @Column(nullable = false) var name: String,
  @Column(nullable = false, precision = 18, scale = 6) var quantity: BigDecimal,
  @Column(name = "avg_buy_price", nullable = false, precision = 18, scale = 4)
  var avgBuyPrice: BigDecimal,
  @Enumerated(EnumType.STRING)
  @Column(name = "asset_type", nullable = false, length = 50)
  var assetType: AssetType,

  /** Devise native de l'actif (USD, CAD…) */
  @Column(nullable = false, length = 10) var currency: String = "CAD",

  /** Valeur comptable en CAD — toujours comparable entre actifs */
  @Column(name = "book_value_cad", nullable = false, precision = 18, scale = 2)
  var bookValueCad: BigDecimal = BigDecimal.ZERO,

  /** Valeur marchande actuelle en devise native */
  @Column(name = "market_value", nullable = false, precision = 18, scale = 4)
  var marketValue: BigDecimal = BigDecimal.ZERO,

  /** Rendements non réalisés du marché */
  @Column(name = "unrealized_gain", precision = 18, scale = 4)
  var unrealizedGain: BigDecimal? = null,
  @Column(name = "gain_currency", length = 10) var gainCurrency: String? = null,
  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 10)
  var status: AssetStatus = AssetStatus.OPEN,
  @Column(name = "opened_at", nullable = false) var openedAt: Instant = Instant.now(),
  @Column(name = "closed_at") var closedAt: Instant? = null,
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
