package com.portfolioai.analysis.application

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.analysis.domain.TickerNarrativeSnapshot
import com.portfolioai.analysis.infrastructure.persistence.TickerNarrativeSnapshotRepository
import com.portfolioai.market.domain.Indicators
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Persists one narrative LLM output as a [TickerNarrativeSnapshot]. Snapshots are append-only — we
 * never update or delete an existing one, so an LLM regression remains debuggable from history.
 *
 * Runs in its own short `@Transactional` so the long-running LLM call upstream does not hold a DB
 * connection.
 *
 * Reuses the **Spring-autoconfigured** [ObjectMapper] — it has the JavaTime module registered, so
 * `Instant` fields on [Indicators] serialize correctly. A locally-instantiated
 * `jacksonObjectMapper` would not, and would throw at runtime.
 */
@Component
class TickerNarrativePersister(
  private val repository: TickerNarrativeSnapshotRepository,
  private val jsonMapper: ObjectMapper,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Transactional
  fun persist(
    symbol: String,
    indicators: Indicators,
    parsed: ParsedNarrative,
    modelUsed: String,
  ): TickerNarrativeSnapshot {
    val snapshot =
      TickerNarrativeSnapshot(
        symbol = symbol,
        price = indicators.price,
        indicatorsJson = jsonMapper.writeValueAsString(indicators),
        summary = parsed.summary,
        sentiment = parsed.sentiment,
        keyPointsJson = jsonMapper.writeValueAsString(parsed.keyPoints),
        modelUsed = modelUsed,
        promptVersion = NARRATIVE_PROMPT_VERSION,
      )
    val saved = repository.save(snapshot)
    log.info(
      "Narrative snapshot saved id={} symbol={} sentiment={} model={}",
      saved.id,
      saved.symbol,
      saved.sentiment,
      saved.modelUsed,
    )
    return saved
  }
}
