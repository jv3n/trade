package com.portfolioai.news.domain

/**
 * Outbound port for the per-ticker news section on the dossier ticker. Returns the most recent
 * headlines, sorted newest-first. The active adapter is selected at every call by
 * `RoutingNewsClient` (`@Primary`) based on the runtime value of `news.provider` in
 * `AppConfigService` — both `MockNewsClient` and `FinnhubClient` are always wired, no
 * `@ConditionalOnProperty`.
 *
 * Cap on `limit` is the adapter's responsibility — Finnhub for example tops out at 100 articles per
 * call regardless of the date window.
 */
interface NewsClient {
  fun fetchNews(symbol: String, limit: Int = 10): List<NewsItem>
}
