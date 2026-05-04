package com.portfolioai.news.application.dto

import com.portfolioai.news.domain.NewsItem
import java.time.Instant

/** Outbound representation of a news headline for the front. */
data class NewsItemDto(
  val id: String,
  val symbol: String,
  val headline: String,
  val summary: String?,
  val source: String,
  val url: String,
  val imageUrl: String?,
  val publishedAt: Instant,
  val category: String?,
)

fun NewsItem.toDto() =
  NewsItemDto(
    id = id,
    symbol = symbol,
    headline = headline,
    summary = summary,
    source = source,
    url = url,
    imageUrl = imageUrl,
    publishedAt = publishedAt,
    category = category,
  )
