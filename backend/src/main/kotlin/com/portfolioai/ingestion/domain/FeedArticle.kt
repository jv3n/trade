package com.portfolioai.ingestion.domain

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "feed_article")
class FeedArticle(
  @Id val id: UUID = UUID.randomUUID(),
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "source_id") val source: FeedSource,
  val guid: String,
  val title: String,
  @Column(columnDefinition = "text") val description: String?,
  val link: String?,
  val publishedAt: Instant?,
  val fetchedAt: Instant = Instant.now(),
)
