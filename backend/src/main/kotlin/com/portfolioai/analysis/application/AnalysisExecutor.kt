package com.portfolioai.analysis.application

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.analysis.domain.Recommendation
import com.portfolioai.analysis.domain.RecommendationAction
import com.portfolioai.analysis.domain.RecommendationActionItem
import com.portfolioai.analysis.infrastructure.llm.LlmClient
import com.portfolioai.analysis.infrastructure.persistence.RecommendationRepository
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

@Component
class AnalysisExecutor(
  private val portfolioRepository: PortfolioRepository,
  private val articleRepository: FeedArticleRepository,
  private val recommendationRepository: RecommendationRepository,
  private val llmClient: LlmClient,
  private val objectMapper: ObjectMapper,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Transactional
  fun execute(portfolioId: UUID): Recommendation {
    val portfolio = portfolioRepository.findByIdOrNull(portfolioId)!!
    val articles = articleRepository.findTop50ByOrderByPublishedAtDesc()
    if (articles.isEmpty()) log.warn("No articles available for analysis")

    val userMessage = buildUserMessage(portfolio, articles.take(10))
    log.info("Calling LLM for portfolio '{}' with {} articles", portfolio.name, articles.size)
    val rawResponse = llmClient.complete(SYSTEM_PROMPT, userMessage, maxTokens = 800)
    log.info("Raw LLM response: {}", rawResponse)

    return parseAndSave(portfolio, rawResponse)
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

  private fun extractJson(raw: String): String {
    val stripped = raw.replace(Regex("```(?:json)?\\s*"), "").trim()
    val start = stripped.indexOf('{')
    val end = stripped.lastIndexOf('}')
    return if (start != -1 && end > start) stripped.substring(start, end + 1) else stripped
  }

  private fun parseAndSave(portfolio: Portfolio, rawResponse: String): Recommendation {
    val parsed =
      try {
        objectMapper.readValue(extractJson(rawResponse), LlmResponse::class.java)
      } catch (e: Exception) {
        log.error("Failed to parse LLM response: {}", e.message)
        throw IllegalStateException("LLM returned an unexpected response format", e)
      }

    val actions =
      if (parsed.actions.isEmpty() && portfolio.assets.isNotEmpty()) {
        log.warn("LLM returned no actions — falling back to HOLD for all tickers")
        portfolio.assets.map {
          LlmAction(ticker = it.ticker, action = "HOLD", rationale = "No signal detected.")
        }
      } else {
        parsed.actions
      }

    val recommendation =
      Recommendation(
        portfolio = portfolio,
        contextSummary = parsed.contextSummary,
        content = parsed.content,
        confidence = parsed.confidence?.toShort(),
      )

    actions.forEach { action ->
      recommendation.actions.add(
        RecommendationActionItem(
          recommendation = recommendation,
          ticker = action.ticker.uppercase(),
          action = RecommendationAction.valueOf(action.action.uppercase()),
          rationale = action.rationale,
          targetWeight = action.targetWeight?.let { BigDecimal(it.toString()) },
        )
      )
    }

    val saved = recommendationRepository.save(recommendation)
    log.info("Recommendation saved id={} actions={}", saved.id, saved.actions.size)
    return saved
  }
}

@JsonIgnoreProperties(ignoreUnknown = true)
private data class LlmResponse(
  val content: String = "",
  val confidence: Int? = null,
  val contextSummary: String = "",
  val actions: List<LlmAction> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
internal data class LlmAction(
  val ticker: String = "",
  val action: String = "HOLD",
  val rationale: String? = null,
  val targetWeight: Double? = null,
)
