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
import com.portfolioai.portfolio.domain.Portfolio
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioRepository
import java.math.BigDecimal
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
    val assetsSection =
      if (portfolio.assets.isEmpty()) "  (empty portfolio)"
      else
        portfolio.assets.joinToString("\n") { a ->
          "  - ${a.ticker} (${a.assetType}): ${a.quantity} units @ avg ${a.avgBuyPrice} — ${a.name}"
        }

    val articlesSection =
      if (articles.isEmpty()) "  (no recent news)"
      else articles.joinToString("\n") { a -> "  [${a.source.name}] ${a.title}" }

    val tickers = portfolio.assets.map { it.ticker }
    val totalValue = portfolio.assets.sumOf { it.quantity * it.avgBuyPrice }

    return """
Portfolio: ${portfolio.name}
Total value: $totalValue

Positions:
$assetsSection

Recent news:
$articlesSection

You MUST output one action for EACH of these tickers: ${tickers.joinToString(", ")}
Output valid JSON only.
    """
      .trimIndent()
  }

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
