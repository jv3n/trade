package com.portfolioai.ingestion.domain

import jakarta.persistence.*
import java.util.UUID

@Entity
@Table(name = "feed_source")
class FeedSource(
  @Id val id: UUID = UUID.randomUUID(),
  val slug: String,
  val name: String,
  val url: String,
  @Enumerated(EnumType.STRING) val category: FeedCategory,
  var enabled: Boolean = true,
  val description: String = "",
  val free: Boolean = true,
  @Column(name = "requires_api_key") val requiresApiKey: Boolean = false,
)

enum class FeedCategory {
  RSS,
  MARKET,
  MACRO,
  CRYPTO,
}
