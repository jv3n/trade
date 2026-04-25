package com.portfolioai.ingestion.infrastructure.persistence

import com.portfolioai.ingestion.domain.FeedSource
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FeedSourceRepository : JpaRepository<FeedSource, UUID> {
    fun findByEnabledTrue(): List<FeedSource>
}
