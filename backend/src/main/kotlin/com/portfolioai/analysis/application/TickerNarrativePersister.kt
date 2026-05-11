package com.portfolioai.analysis.application

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.analysis.domain.PromptTemplate
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
  private val promptService: TickerNarrativePromptService,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Transactional
  fun persist(
    symbol: String,
    indicators: Indicators,
    parsed: ParsedNarrative,
    modelUsed: String,
    promptTemplate: PromptTemplate,
  ): TickerNarrativeSnapshot {
    // The fallback `PromptTemplate` returned by [TickerNarrativePromptService] when the DB has no
    // active row carries a sentinel UUID that does NOT exist in `prompt_template`. Persisting it
    // would 23503 the FK ; we store null instead to keep the row consistent. Service exposes the
    // detection so we don't have to compare UUIDs in two places.
    val templateId = if (promptService.isFallback(promptTemplate)) null else promptTemplate.id
    val snapshot =
      TickerNarrativeSnapshot(
        symbol = symbol,
        price = indicators.price,
        indicatorsJson = jsonMapper.writeValueAsString(indicators),
        summary = parsed.summary,
        sentiment = parsed.sentiment,
        keyPointsJson = jsonMapper.writeValueAsString(parsed.keyPoints),
        modelUsed = modelUsed,
        // Mirror the version *string* from the template so the legacy `prompt_version` column
        // stays informative (filters on string still work even if the FK is null on the
        // fallback path).
        promptVersion = promptTemplate.version,
        promptTemplateId = templateId,
      )
    val saved = repository.save(snapshot)
    log.info(
      "Narrative snapshot saved id={} symbol={} sentiment={} model={} promptVersion={}",
      saved.id,
      saved.symbol,
      saved.sentiment,
      saved.modelUsed,
      saved.promptVersion,
    )
    return saved
  }
}
