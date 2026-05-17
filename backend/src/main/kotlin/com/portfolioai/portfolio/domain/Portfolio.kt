package com.portfolioai.portfolio.domain

import com.portfolioai.auth.domain.User
import jakarta.persistence.CascadeType
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.OneToMany
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "portfolio")
class Portfolio(
  @Id val id: UUID = UUID.randomUUID(),
  /**
   * Owner of this portfolio. Multi-tenant scope key — every read path through
   * [com.portfolioai.portfolio.application.PortfolioQueryService] filters on this column. Cross-
   * module dependency on the `auth/` package accepted pragmatically : the alternative (raw `userId:
   * UUID` column with no JPA relation) would force every JPQL query to write `WHERE p.userId =
   * :userId` as a flat predicate ; the `@ManyToOne` lets us write `WHERE a.portfolio.user.id =
   * :userId` in `AssetRepository.findOwnedTickerRows` and `SnapshotRepository.findAllWithPortfolio`
   * where the JOIN is already natural. Lazy-loaded — the service code reads `user.id` only.
   */
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,
  @Column(nullable = false) var name: String,
  @Column(columnDefinition = "TEXT") var description: String? = null,
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
  @OneToMany(
    mappedBy = "portfolio",
    cascade = [CascadeType.ALL],
    orphanRemoval = true,
    fetch = FetchType.LAZY,
  )
  val assets: MutableList<Asset> = mutableListOf(),
)
