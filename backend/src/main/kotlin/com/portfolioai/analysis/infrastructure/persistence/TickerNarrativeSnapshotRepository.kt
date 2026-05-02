package com.portfolioai.analysis.infrastructure.persistence

import com.portfolioai.analysis.domain.TickerNarrativeSnapshot
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface TickerNarrativeSnapshotRepository : JpaRepository<TickerNarrativeSnapshot, UUID> {
  /**
   * Most recent snapshot for [symbol]. The cache window check (snapshot age < 30 min ?) lives in
   * the application layer ; we return whichever is freshest, the caller decides.
   */
  fun findFirstBySymbolOrderByGeneratedAtDesc(symbol: String): TickerNarrativeSnapshot?
}
