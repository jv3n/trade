package com.portfolioai.analysis.application

import com.portfolioai.ingestion.domain.FeedArticle
import com.portfolioai.ingestion.infrastructure.persistence.FeedArticleRepository
import com.portfolioai.portfolio.domain.Asset
import com.portfolioai.portfolio.domain.Portfolio
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioRepository
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Loads everything the LLM needs from the database in a short read-only transaction, builds the
 * user message, and returns a detached [AnalysisContext]. The caller can then close the DB
 * connection before doing the slow LLM call.
 */
@Component
class AnalysisContextLoader(
  private val portfolioRepository: PortfolioRepository,
  private val articleRepository: FeedArticleRepository,
  private val articleRelevanceScorer: ArticleRelevanceScorer,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Transactional(readOnly = true)
  fun load(portfolioId: UUID): AnalysisContext {
    val portfolio =
      portfolioRepository.findByIdOrNull(portfolioId)
        ?: throw NoSuchElementException("Portfolio $portfolioId not found")
    val recent = articleRepository.findTop200ByOrderByPublishedAtDesc()
    if (recent.isEmpty()) log.warn("No articles available for analysis")

    val relevant = articleRelevanceScorer.rank(recent, portfolio)
    log.info(
      "Loaded context for portfolio '{}' with {} relevant articles (out of {} recent)",
      portfolio.name,
      relevant.size,
      recent.size,
    )

    return AnalysisContext(
      portfolioId = portfolio.id,
      portfolioName = portfolio.name,
      tickers = portfolio.assets.map { it.ticker },
      userMessage = buildUserMessage(portfolio, relevant),
    )
  }

  private fun buildUserMessage(portfolio: Portfolio, articles: List<FeedArticle>): String {
    val views = portfolio.assets.map { it.toView() }
    val totalBookCad = views.sumOf { it.asset.bookValueCad }
    val totalMarketCad = views.sumOf { it.marketValueCad }
    val totalGainCad = totalMarketCad - totalBookCad
    val totalGainPct =
      if (totalBookCad.signum() > 0)
        totalGainCad.multiply(BigDecimal(100)).divide(totalBookCad, 1, RoundingMode.HALF_UP)
      else null

    val assetsSection =
      if (views.isEmpty()) "  (empty portfolio)"
      else
        views
          .sortedByDescending { it.marketValueCad }
          .joinToString("\n") { v ->
            val weight =
              if (totalMarketCad.signum() > 0)
                v.marketValueCad
                  .multiply(BigDecimal(100))
                  .divide(totalMarketCad, 1, RoundingMode.HALF_UP)
              else BigDecimal.ZERO
            val unrealized =
              v.unrealizedPct?.let { ", unrealized ${if (it.signum() >= 0) "+" else ""}$it%" } ?: ""
            "  - ${v.asset.ticker} (${v.asset.assetType}): ${v.asset.quantity} units, " +
              "market ${v.asset.marketValue} ${v.asset.currency} (~${v.marketValueCad.setScale(0, RoundingMode.HALF_UP)} CAD), " +
              "weight $weight%$unrealized — ${v.asset.name}"
          }

    val articlesSection =
      if (articles.isEmpty()) "  (no recent news)"
      else
        articles.joinToString("\n") { a ->
          val desc =
            a.description?.take(140)?.replace("\n", " ")?.trim()?.takeIf { it.isNotBlank() }
          if (desc == null) "  [${a.source.name}] ${a.title}"
          else "  [${a.source.name}] ${a.title} — $desc"
        }

    val tickers = portfolio.assets.map { it.ticker }
    val totalLine = buildString {
      append("Total book value: ${totalBookCad.setScale(0, RoundingMode.HALF_UP)} CAD")
      append(
        " | Total market value (approx): ${totalMarketCad.setScale(0, RoundingMode.HALF_UP)} CAD"
      )
      if (totalGainPct != null) {
        val sign = if (totalGainCad.signum() >= 0) "+" else ""
        append(
          " | Unrealized P&L: $sign${totalGainCad.setScale(0, RoundingMode.HALF_UP)} CAD ($sign$totalGainPct%)"
        )
      }
    }

    return """
Portfolio: ${portfolio.name}
$totalLine

Positions (sorted by market value, weights based on approximate CAD market value):
$assetsSection

Recent news:
$articlesSection

You MUST output one action for EACH of these tickers: ${tickers.joinToString(", ")}
targetWeight is the desired share of total market value in percent — all targetWeight values should sum to ~100.
Output valid JSON only.
    """
      .trimIndent()
  }

  /**
   * Convert each asset to a view enriched with an approximate CAD market value. We don't store a
   * live FX rate; we derive it from the FX implicit at purchase (`bookValueCad / costNative`).
   * That's an approximation — fine until we wire a proper FX feed.
   */
  private fun Asset.toView(): AssetView {
    val costNative = quantity.multiply(avgBuyPrice)
    val fxAtPurchase =
      if (costNative.signum() > 0) bookValueCad.divide(costNative, 6, RoundingMode.HALF_UP)
      else BigDecimal.ONE
    val marketValueCad = marketValue.multiply(fxAtPurchase)
    val unrealizedPct =
      if (costNative.signum() > 0)
        (marketValue - costNative)
          .multiply(BigDecimal(100))
          .divide(costNative, 1, RoundingMode.HALF_UP)
      else null
    return AssetView(this, marketValueCad, unrealizedPct)
  }

  private data class AssetView(
    val asset: Asset,
    val marketValueCad: BigDecimal,
    val unrealizedPct: BigDecimal?,
  )
}

/** Detached snapshot of everything the LLM call needs. Holds no JPA-managed entities. */
data class AnalysisContext(
  val portfolioId: UUID,
  val portfolioName: String,
  val tickers: List<String>,
  val userMessage: String,
)
