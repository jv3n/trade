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
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class AnalysisRunner(
  private val portfolioRepository: PortfolioRepository,
  private val articleRepository: FeedArticleRepository,
  private val recommendationRepository: RecommendationRepository,
  private val llmClient: LlmClient,
  private val jobStore: AnalysisJobStore,
  private val objectMapper: ObjectMapper,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Async
  @Transactional
  fun run(portfolioId: UUID, jobId: UUID) {
    try {
      val portfolio = portfolioRepository.findByIdOrNull(portfolioId)!!
      val articles = articleRepository.findTop50ByOrderByPublishedAtDesc()
      if (articles.isEmpty()) log.warn("No articles available for analysis")

      val recommendation = buildAndSave(portfolio, articles.take(10))
      jobStore.complete(jobId, recommendation.id)
    } catch (e: Exception) {
      log.error("Analysis job {} failed: {}", jobId, e.message)
      jobStore.fail(jobId, e.message ?: "Unknown error")
    }
  }

  private fun buildAndSave(portfolio: Portfolio, articles: List<FeedArticle>): Recommendation {
    val userMessage = buildUserMessage(portfolio, articles)
    log.info(
      "Requesting analysis from LLM for portfolio '{}' with {} articles",
      portfolio.name,
      articles.size,
    )
    val rawResponse = llmClient.complete(SYSTEM_PROMPT, userMessage, maxTokens = 800)
    return parseAndSave(portfolio, rawResponse)
  }

  private fun buildUserMessage(portfolio: Portfolio, articles: List<FeedArticle>): String {
    val assetsSection =
      if (portfolio.assets.isEmpty()) {
        "  (empty portfolio — no positions yet)"
      } else {
        portfolio.assets.joinToString("\n") { a ->
          "  - ${a.ticker} (${a.assetType}): ${a.quantity} units @ avg ${a.avgBuyPrice} — ${a.name}"
        }
      }

    val articlesSection =
      if (articles.isEmpty()) {
        "  (no recent news available)"
      } else {
        articles.joinToString("\n") { a ->
          "  [${a.source.name}] ${a.title}: ${a.description?.take(100) ?: ""}"
        }
      }

    val totalValue = portfolio.assets.sumOf { it.quantity * it.avgBuyPrice }

    return """
Portfolio: ${portfolio.name}
${portfolio.description?.let { "Description: $it\n" } ?: ""}Estimated total value: $totalValue

Current positions (give an action for EACH):
$assetsSection

Recent market news (${articles.size} articles — use these to justify your decisions):
$articlesSection

Give CONCRETE buy/sell/hold/reduce decisions for each position. Be decisive.
        """
      .trimIndent()
  }

  private fun extractJson(raw: String): String {
    val stripped = raw.replace(Regex("```(?:json)?\\s*"), "").trim()
    val start = stripped.indexOf('{')
    val end = stripped.lastIndexOf('}')
    if (start != -1 && end > start) return stripped.substring(start, end + 1)
    return stripped
  }

  private fun parseAndSave(portfolio: Portfolio, rawResponse: String): Recommendation {
    log.info("Raw LLM response: {}", rawResponse)
    val parsed =
      try {
        objectMapper.readValue(extractJson(rawResponse), ClaudeRecommendationResponse::class.java)
      } catch (e: Exception) {
        log.error(
          "Failed to parse LLM response (extracted: {}): {}",
          extractJson(rawResponse),
          e.message,
        )
        throw IllegalStateException("LLM returned an unexpected response format", e)
      }

    val recommendation =
      Recommendation(
        portfolio = portfolio,
        contextSummary = parsed.contextSummary,
        content = parsed.content,
        confidence = parsed.confidence?.toShort(),
      )

    parsed.actions.forEach { action ->
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
    log.info(
      "Recommendation saved id={} confidence={} actions={}",
      saved.id,
      saved.confidence,
      saved.actions.size,
    )
    return saved
  }
}

@JsonIgnoreProperties(ignoreUnknown = true)
private data class ClaudeRecommendationResponse(
  val content: String = "",
  val confidence: Int? = null,
  val contextSummary: String = "",
  val actions: List<ClaudeAction> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class ClaudeAction(
  val ticker: String = "",
  val action: String = "HOLD",
  val rationale: String? = null,
  val targetWeight: Double? = null,
)
