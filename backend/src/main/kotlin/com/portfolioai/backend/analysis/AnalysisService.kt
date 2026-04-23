package com.portfolioai.backend.analysis

import com.portfolioai.backend.portfolio.PortfolioRepository
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import java.util.UUID

internal val SYSTEM_PROMPT = """
You are a portfolio analyst. Respond ONLY with a JSON object, no explanation, no markdown.
JSON format: {"content":"string","confidence":50,"contextSummary":"string","actions":[{"ticker":"AAPL","action":"HOLD","rationale":"string","targetWeight":10}]}
Rules: one action per position, action is BUY or SELL or HOLD or REDUCE, all text in French, weights sum to 100.
""".trimIndent()

@Service
class AnalysisService(
    private val portfolioRepository: PortfolioRepository,
    private val jobStore: AnalysisJobStore,
    private val runner: AnalysisRunner,
) {
    fun startAsync(portfolioId: UUID): AnalysisJob {
        portfolioRepository.findByIdOrNull(portfolioId)
            ?: throw NoSuchElementException("Portfolio $portfolioId not found")
        val job = jobStore.create()
        runner.run(portfolioId, job.id)
        return job
    }
}
