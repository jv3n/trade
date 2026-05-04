package com.portfolioai.news.infrastructure.news

import com.portfolioai.news.domain.NewsItem
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.random.Random
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * In-memory news source for local dev — generates a deterministic synthetic feed per symbol so the
 * dossier news panel can be exercised without burning the Finnhub free quota or requiring a key for
 * onboarding / CI.
 *
 * Activation : `news.provider: mock` (the default in `application.yml`).
 *
 * Properties of the generator :
 * - **Deterministic per symbol** — same symbol always yields the same headlines (seed = symbol
 *   hash). Reload the dossier and the section looks identical, useful for visual regression.
 * - **Varied across symbols** — different headline templates and source rotation so the panel
 *   doesn't all look the same when navigating between tickers.
 * - **Realistic shape** — datetimes spread over the last 30 days (matching what Finnhub returns on
 *   a real ticker), one or two items missing a summary (the front's null-handling path is
 *   exercised), the occasional empty list (if the symbol hash falls in a "quiet" bucket — about 10
 *   % of symbols, enough to make the empty-state path show up regularly in dev without making it
 *   the default).
 *
 * Reserved symbols : none today, unlike `MockMarketChartClient`. The news panel doesn't have a
 * dedicated 404 path (empty list is the natural empty state), and the 503 error is exercised by
 * switching to `news.provider: finnhub` with a blank api-key.
 */
@Component
class MockNewsClient : NewsClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun fetchNews(symbol: String, limit: Int): List<NewsItem> {
    val upper = symbol.uppercase()
    log.info("Mock news symbol={} limit={}", upper, limit)

    val rng = Random(upper.hashCode().toLong())
    val now = Instant.now()
    // ~10 % of symbols are "quiet" — return empty so the empty-state UI is exercised regardless
    // of the live network. Threshold tuned to be visible (a few cases) but not the default.
    if (rng.nextInt(10) == 0) return emptyList()

    val itemCount = (rng.nextInt(MAX_ITEMS - MIN_ITEMS + 1) + MIN_ITEMS).coerceAtMost(limit)
    return (0 until itemCount).map { i ->
      val template = HEADLINE_TEMPLATES[rng.nextInt(HEADLINE_TEMPLATES.size)]
      val source = SOURCES[rng.nextInt(SOURCES.size)]
      val category = CATEGORIES[rng.nextInt(CATEGORIES.size)]
      // Spread items over the last 30 days, newer items first. Each item is ≥6 h apart so the
      // relative-time formatter on the front gets a mix of "il y a X h" and "il y a X j".
      val agedHours = (i * HOURS_BETWEEN_ITEMS) + rng.nextInt(HOURS_JITTER)
      val publishedAt = now.minus(agedHours.toLong(), ChronoUnit.HOURS)
      // 25 % of items have no summary — exercises the front's null-handling path.
      val summary =
        if (rng.nextInt(4) == 0) null else "Mock summary for $upper covering recent activity."
      NewsItem(
        id = "mock-${upper}-${i}",
        symbol = upper,
        headline = template.replace("{symbol}", upper),
        summary = summary,
        source = source,
        url = "https://example.com/news/$upper/$i",
        imageUrl = null,
        publishedAt = publishedAt,
        category = category,
      )
    }
  }

  companion object {
    private const val MIN_ITEMS = 4
    private const val MAX_ITEMS = 10
    private const val HOURS_BETWEEN_ITEMS = 12
    private const val HOURS_JITTER = 6

    /** Variety of templates so the panel doesn't read identically across symbols. */
    private val HEADLINE_TEMPLATES =
      listOf(
        "{symbol} reports strong quarterly results, beats analyst expectations",
        "{symbol} announces strategic partnership with major industry player",
        "Analysts upgrade {symbol} on improved outlook",
        "{symbol} unveils new product line, shares react",
        "Earnings preview : what to watch for {symbol} this week",
        "Insider activity at {symbol} draws attention",
        "{symbol} CEO interview : strategy for the next 12 months",
        "Sector rotation : {symbol} positioned for the macro shift",
      )

    private val SOURCES = listOf("Reuters", "Bloomberg", "CNBC", "MarketWatch", "Financial Times")

    private val CATEGORIES = listOf("company news", "earnings", "analyst rating", "general")
  }
}
