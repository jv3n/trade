package com.portfolioai.backend.analysis

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.backend.ingestion.FeedArticle
import com.portfolioai.backend.ingestion.FeedArticleRepository
import com.portfolioai.backend.portfolio.Portfolio
import com.portfolioai.backend.portfolio.PortfolioRepository
import org.slf4j.LoggerFactory
import org.springframework.data.repository.findByIdOrNull
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.util.UUID

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

            val recommendation = buildAndSave(portfolio, articles.take(2))
            jobStore.complete(jobId, recommendation.id)
        } catch (e: Exception) {
            log.error("Analysis job {} failed: {}", jobId, e.message)
            jobStore.fail(jobId, e.message ?: "Unknown error")
        }
    }

    private fun buildAndSave(portfolio: Portfolio, articles: List<FeedArticle>): Recommendation {
        val userMessage = buildUserMessage(portfolio, articles)
        log.info("Requesting analysis from LLM for portfolio '{}' with {} articles", portfolio.name, articles.size)
        val rawResponse = llmClient.complete(SYSTEM_PROMPT, userMessage, maxTokens = 400)
        return parseAndSave(portfolio, rawResponse)
    }

    private fun buildUserMessage(portfolio: Portfolio, articles: List<FeedArticle>): String {
        val assetsSection = if (portfolio.assets.isEmpty()) {
            "  (empty portfolio — no positions yet)"
        } else {
            portfolio.assets.joinToString("\n") { a ->
                "  - ${a.ticker} (${a.assetType}): ${a.quantity} units @ avg ${a.avgBuyPrice} — ${a.name}"
            }
        }

        val articlesSection = if (articles.isEmpty()) {
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
        """.trimIndent()
    }

    private fun extractJson(raw: String): String {
        // Extrait le premier bloc JSON valide même si le modèle ajoute du markdown autour
        val start = raw.indexOf('{')
        val end = raw.lastIndexOf('}')
        if (start != -1 && end > start) return raw.substring(start, end + 1)
        return raw
    }

    private fun parseAndSave(portfolio: Portfolio, rawResponse: String): Recommendation {
        val parsed = try {
            objectMapper.readValue(extractJson(rawResponse), ClaudeRecommendationResponse::class.java)
        } catch (e: Exception) {
            log.error("Failed to parse LLM response: {}", rawResponse)
            throw IllegalStateException("LLM returned an unexpected response format", e)
        }

        val recommendation = Recommendation(
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
        log.info("Recommendation saved id={} confidence={} actions={}", saved.id, saved.confidence, saved.actions.size)
        return saved
    }
}

private data class ClaudeRecommendationResponse(
    val content: String,
    val confidence: Int?,
    val contextSummary: String,
    val actions: List<ClaudeAction> = emptyList(),
)

private data class ClaudeAction(
    val ticker: String,
    val action: String,
    val rationale: String?,
    val targetWeight: Double?,
)
