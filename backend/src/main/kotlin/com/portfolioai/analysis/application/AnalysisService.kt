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
  "content": "2-3 sentence overall analysis grounded in the data provided",
  "confidence": 75,
  "contextSummary": "1 sentence summarizing the key data points you used (total value, top positions, dominant article themes)",
  "actions": [
    {"ticker": "<one of the portfolio tickers>", "action": "HOLD", "rationale": "one sentence reason", "targetWeight": 12.5},
    {"ticker": "<another portfolio ticker>", "action": "REDUCE", "rationale": "one sentence reason", "targetWeight": 8.0}
  ]
}

Each position is provided with its current market value (CAD-equivalent), current weight (% of total market value) and unrealized P&L. Reason about the portfolio in terms of market value and weights — not entry prices. Do NOT invent tickers, sectors or positions that are not in the data provided.

MANDATORY RULES — a server-side validator will reject your response if any of these are violated; you will be asked to retry with the errors:
1. "actions" MUST have **exactly one entry for every ticker listed in the portfolio** — no missing ticker, no duplicate ticker, no extra ticker not in the portfolio
2. "action" must be exactly one of: BUY, SELL, HOLD, REDUCE
3. "confidence" must be an integer 0-100
4. "targetWeight" is the desired share of total market value in percent (0.0-100.0); the targetWeight values **must sum to between 95 and 105** (≈ 100 %)
5. SELL means exiting the position — its "targetWeight" must be ≤ 5.0
6. Do NOT wrap the JSON in markdown code fences
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
