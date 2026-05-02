package com.portfolioai.analysis.infrastructure.persistence

import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.domain.TickerNarrativeJob
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface TickerNarrativeJobRepository : JpaRepository<TickerNarrativeJob, UUID> {
  /**
   * Most recent PENDING job for [symbol] created after [after]. Used to dedup re-fired generation
   * requests on the same ticker while the LLM is still chewing.
   */
  fun findFirstBySymbolAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(
    symbol: String,
    status: JobStatus,
    after: Instant,
  ): TickerNarrativeJob?
}
