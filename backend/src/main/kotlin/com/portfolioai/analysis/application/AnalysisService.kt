package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.AnalysisJob
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioRepository
import java.util.UUID
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service

internal val SYSTEM_PROMPT =
  """
You are a financial portfolio analyst. Respond with ONLY a valid JSON object, no prose, no markdown.

Required JSON structure:
{
  "content": "2-3 sentence overall analysis",
  "confidence": 75,
  "contextSummary": "1 sentence describing what data was used",
  "actions": [
    {"ticker": "AAPL", "action": "HOLD", "rationale": "one sentence reason", "targetWeight": 12.5},
    {"ticker": "NVDA", "action": "REDUCE", "rationale": "one sentence reason", "targetWeight": 8.0}
  ]
}

Each position is provided with its current market value (CAD-equivalent), current weight (% of total market value) and unrealized P&L. Reason about the portfolio in terms of market value and weights — not entry prices.

MANDATORY RULES — violating any of these makes the response invalid:
1. The "actions" array MUST have exactly one entry per ticker listed in the portfolio — never zero, never skip a ticker
2. "action" must be exactly one of: BUY, SELL, HOLD, REDUCE
3. "confidence" must be an integer 0-100
4. "targetWeight" is the desired share of total market value in percent (0.0-100.0); the targetWeight values across all actions should sum to roughly 100
5. Do NOT wrap the JSON in markdown code fences
"""
    .trimIndent()

@Service
class AnalysisService(
  private val portfolioRepository: PortfolioRepository,
  private val jobStore: AnalysisJobStore,
  private val runner: AnalysisRunner,
) {
  fun startAsync(portfolioId: UUID): AnalysisJob {
    portfolioRepository.findByIdOrNull(portfolioId)
      ?: throw NoSuchElementException("Portfolio $portfolioId not found")
    jobStore.pendingFor(portfolioId)?.let {
      return it
    }
    val job = jobStore.create(portfolioId)
    runner.run(portfolioId, job.id)
    return job
  }
}
