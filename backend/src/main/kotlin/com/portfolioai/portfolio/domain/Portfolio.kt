package com.portfolioai.portfolio.domain

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "portfolio")
class Portfolio(
  @Id val id: UUID = UUID.randomUUID(),
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
