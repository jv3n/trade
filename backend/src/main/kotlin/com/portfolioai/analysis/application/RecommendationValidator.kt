package com.portfolioai.analysis.application

import org.springframework.stereotype.Component

/**
 * Validates a parsed LLM response against a portfolio's actual tickers and the SYSTEM_PROMPT
 * contract. The errors it produces are fed back into the LLM on retry — phrased so a model can act
 * on them.
 */
@Component
class RecommendationValidator {

  fun validate(
    parsed: ParsedLlmRecommendation,
    portfolioTickers: Collection<String>,
  ): ValidationResult {
    val errors = mutableListOf<String>()
    val portfolio = portfolioTickers.map { it.uppercase() }.toSet()
    val actionTickers = parsed.actions.map { it.ticker.uppercase() }

    // Duplicate tickers in actions
    val duplicates = actionTickers.groupingBy { it }.eachCount().filter { it.value > 1 }.keys
    if (duplicates.isNotEmpty()) {
      errors += "Duplicate actions for ticker(s): ${duplicates.joinToString(", ")}"
    }

    // Missing portfolio tickers
    val missing = portfolio - actionTickers.toSet()
    if (missing.isNotEmpty()) {
      errors += "Missing actions for ticker(s): ${missing.joinToString(", ")}"
    }

    // Hallucinated tickers (in actions but not in portfolio)
    val extra = actionTickers.toSet() - portfolio
    if (extra.isNotEmpty()) {
      errors += "Unknown ticker(s) in actions (not in portfolio): ${extra.joinToString(", ")}"
    }

    // Action enum
    val invalidActions = parsed.actions.filter { it.action !in VALID_ACTIONS }
    if (invalidActions.isNotEmpty()) {
      errors +=
        "Invalid action value(s): ${invalidActions.joinToString(", ") { "${it.ticker}=${it.action}" }} (allowed: ${VALID_ACTIONS.joinToString(",")})"
    }

    // Confidence range
    parsed.confidence?.let { if (it !in 0..100) errors += "Confidence must be 0-100, got $it" }

    // targetWeight per-action range
    val outOfRange =
      parsed.actions.filter { a -> a.targetWeight?.let { it < 0.0 || it > 100.0 } == true }
    if (outOfRange.isNotEmpty()) {
      errors +=
        "targetWeight must be 0-100, got: ${outOfRange.joinToString(", ") { "${it.ticker}=${it.targetWeight}" }}"
    }

    // Sum of targetWeight ≈ 100, only if every portfolio ticker is covered with a numeric weight
    val weightedActionsForPortfolio =
      parsed.actions.filter { it.ticker in portfolio && it.targetWeight != null }
    if (weightedActionsForPortfolio.size == portfolio.size) {
      val sum = weightedActionsForPortfolio.sumOf { it.targetWeight!! }
      if (sum < 100.0 - WEIGHT_SUM_TOLERANCE || sum > 100.0 + WEIGHT_SUM_TOLERANCE) {
        errors +=
          "Sum of targetWeight is ${"%.1f".format(sum)}, must be between ${100.0 - WEIGHT_SUM_TOLERANCE} and ${100.0 + WEIGHT_SUM_TOLERANCE}"
      }
    }

    // SELL ⇒ targetWeight near 0
    val incoherentSell =
      parsed.actions.filter { it.action == "SELL" && (it.targetWeight ?: 0.0) > SELL_MAX_WEIGHT }
    if (incoherentSell.isNotEmpty()) {
      errors +=
        "SELL action implies exiting the position, targetWeight must be ≤ $SELL_MAX_WEIGHT, got: " +
          incoherentSell.joinToString(", ") { "${it.ticker}=${it.targetWeight}" }
    }

    return if (errors.isEmpty()) ValidationResult.Valid else ValidationResult.Invalid(errors)
  }

  companion object {
    private val VALID_ACTIONS = setOf("BUY", "SELL", "HOLD", "REDUCE")
    private const val WEIGHT_SUM_TOLERANCE = 5.0
    private const val SELL_MAX_WEIGHT = 5.0
  }
}

sealed class ValidationResult {
  data object Valid : ValidationResult()

  data class Invalid(val errors: List<String>) : ValidationResult()
}
