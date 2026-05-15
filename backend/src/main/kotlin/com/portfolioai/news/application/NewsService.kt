package com.portfolioai.news.application

import com.portfolioai.market.MarketConfig.Companion.NEWS_CACHE
import com.portfolioai.news.domain.NewsClient
import com.portfolioai.news.domain.NewsItem
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service

/**
 * Use-case service for the per-ticker news section. Thin wrapper around [NewsClient] — its main job
 * is to layer caching on top so the front can poll the dossier endpoint without burning the Finnhub
 * free quota.
 *
 * Caching : 15 min Caffeine TTL ([com.portfolioai.market.MarketConfig.NEWS_CACHE]). Key includes
 * the symbol *uppercased* and the limit so two front-end requests with different limits don't
 * collide. Re-clicks on the same dossier within 15 min hit the cache, no upstream call.
 */
@Service
class NewsService(private val client: NewsClient) {

  // SpEL voit le type JVM `java.lang.String` — `uppercase()` est une extension Kotlin, pas une
  // méthode du runtime. On utilise `toUpperCase()` qui est sur la classe Java elle-même. Le
  // résultat est identique pour des tickers ASCII (le seul cas qu'on rencontre en pratique).
  @Cacheable(NEWS_CACHE, key = "#symbol.toUpperCase() + '|' + #limit")
  fun forSymbol(symbol: String, limit: Int = DEFAULT_LIMIT): List<NewsItem> =
    client.fetchNews(symbol, limit)

  companion object {
    /**
     * Default headline count returned to the front. 10 is plenty for a sidebar / inline panel ; the
     * hardcoded cap on Finnhub's response is 100.
     */
    const val DEFAULT_LIMIT = 10
  }
}
