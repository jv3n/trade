package com.portfolioai.backend.analysis

import com.portfolioai.backend.portfolio.PortfolioRepository
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import java.util.UUID

internal val SYSTEM_PROMPT = """
You are a financial portfolio analyst. Analyze the portfolio and news, then respond with a JSON object.

Output ONLY this JSON structure, nothing else:
{
  "content": "2-3 sentence overall analysis",
  "confidence": 70,
  "contextSummary": "1 sentence describing what data was used",
  "actions": [
    {"ticker": "AAPL", "action": "HOLD", "rationale": "one sentence reason", "targetWeight": 12.5},
    {"ticker": "NVDA", "action": "REDUCE", "rationale": "one sentence reason", "targetWeight": 8.0}
  ]
}

CRITICAL RULES:
- The "actions" array MUST contain one entry for EVERY ticker in the portfolio
- "action" must be exactly one of: BUY, SELL, HOLD, REDUCE
- "confidence" must be an integer between 0 and 100
- "targetWeight" is the suggested portfolio percentage for that position
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
