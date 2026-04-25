package com.portfolioai.ingestion.application.dto

import com.portfolioai.ingestion.domain.FeedArticle
import com.portfolioai.ingestion.domain.FeedCategory
import com.portfolioai.ingestion.domain.FeedSource
import java.time.Instant
import java.util.UUID

data class FeedSourceDto(
  val id: UUID,
  val slug: String,
  val name: String,
  val url: String,
  val category: FeedCategory,
  val enabled: Boolean,
  val description: String,
  val free: Boolean,
  val requiresApiKey: Boolean,
)

data class UpdateSourceEnabledRequest(val enabled: Boolean)

data class FeedArticleDto(
  val id: UUID,
  val sourceName: String,
  val title: String,
  val description: String?,
  val link: String?,
  val publishedAt: Instant?,
  val fetchedAt: Instant,
)

fun FeedSource.toDto() =
  FeedSourceDto(id, slug, name, url, category, enabled, description, free, requiresApiKey)

fun FeedArticle.toDto() =
  FeedArticleDto(id, source.name, title, description, link, publishedAt, fetchedAt)
