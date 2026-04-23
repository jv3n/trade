package com.portfolioai.backend.ingestion

import jakarta.persistence.*
import java.util.UUID

@Entity
@Table(name = "feed_source")
class FeedSource(
    @Id val id: UUID = UUID.randomUUID(),
    val name: String,
    val url: String,
    @Enumerated(EnumType.STRING) val category: FeedCategory,
    val enabled: Boolean = true,
)

enum class FeedCategory { RSS, MARKET, MACRO, CRYPTO }
