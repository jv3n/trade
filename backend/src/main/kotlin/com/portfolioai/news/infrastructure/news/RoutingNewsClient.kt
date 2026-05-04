package com.portfolioai.news.infrastructure.news

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.news.domain.NewsItem
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component

/**
 * Dispatches every news fetch to the right adapter based on the runtime value of
 * [ConfigKeys.NEWS_PROVIDER]. Same rationale as
 * [com.portfolioai.market.infrastructure.market.RoutingMarketChartClient] — both [MockNewsClient]
 * and [FinnhubClient] are always wired, this bean is `@Primary` and routes per call.
 *
 * Caching — `@Cacheable` lives on [com.portfolioai.news.application.NewsService.fetchHeadlines]
 * (one layer up), with a key built from `(symbol, limit)` only. We deliberately don't include the
 * provider in the key : switching providers at runtime should give the user the *new* feed on the
 * next call, not a stale cached one keyed under the same `(AAPL, 10)` tuple. The 15-min TTL means
 * any leftover entries age out quickly.
 */
@Component
@Primary
class RoutingNewsClient(
  @Qualifier("mockNewsClient") private val mock: NewsClient,
  @Qualifier("finnhubClient") private val finnhub: NewsClient,
  private val appConfig: AppConfigService,
) : NewsClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun fetchNews(symbol: String, limit: Int): List<NewsItem> {
    val provider = appConfig.getString(ConfigKeys.NEWS_PROVIDER)
    log.debug("Routing news fetch symbol={} provider={}", symbol, provider)
    return when (provider) {
      ConfigKeys.PROVIDER_MOCK -> mock.fetchNews(symbol, limit)
      ConfigKeys.PROVIDER_FINNHUB -> finnhub.fetchNews(symbol, limit)
      else -> throw IllegalArgumentException("Unknown news provider: '$provider'")
    }
  }
}
