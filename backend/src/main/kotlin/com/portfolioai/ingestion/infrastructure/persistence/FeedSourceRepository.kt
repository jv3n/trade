package com.portfolioai.ingestion.infrastructure.persistence

import com.portfolioai.ingestion.domain.FeedSource
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface FeedSourceRepository : JpaRepository<FeedSource, UUID> {
  fun findByEnabledTrue(): List<FeedSource>
}
