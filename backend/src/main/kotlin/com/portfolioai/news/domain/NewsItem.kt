package com.portfolioai.news.domain

import java.time.Instant

/**
 * One news headline tied to a ticker. Provider-agnostic shape — the [NewsClient] port translates
 * whatever the upstream returns (today : Finnhub) into this. Optional fields stay nullable because
 * not every source sets every field (image is missing on text-only feeds, summary is sometimes
 * empty on press-release-style entries).
 */
data class NewsItem(
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
