package com.portfolioai.news.infrastructure.news

import com.portfolioai.news.domain.NewsItem
import java.time.Instant

/**
 * Pure conversion from Finnhub's wire payload to our domain [NewsItem]. Kept separate from
 * [FinnhubClient] so we can unit test the parsing on JSON fixtures without spinning up
 * MockWebServer.
 */

/**
 * Empty `image` strings (`""`) are emitted by Finnhub for text-only items rather than omitting the
 * field — normalise to `null` so the front can simply branch on absence.
 */
fun FinnhubNewsItem.toDomain(symbol: String): NewsItem =
  NewsItem(
    id = id.toString(),
    symbol = symbol,
    headline = headline,
    summary = summary?.takeIf { it.isNotBlank() },
    source = source,
    url = url,
    imageUrl = image?.takeIf { it.isNotBlank() },
    publishedAt = Instant.ofEpochSecond(datetime),
    category = category?.takeIf { it.isNotBlank() },
  )
