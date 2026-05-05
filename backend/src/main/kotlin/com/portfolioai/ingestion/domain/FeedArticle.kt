package com.portfolioai.ingestion.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
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
