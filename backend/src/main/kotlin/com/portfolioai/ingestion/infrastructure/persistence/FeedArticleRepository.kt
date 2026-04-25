package com.portfolioai.ingestion.infrastructure.persistence

import com.portfolioai.ingestion.domain.FeedArticle
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FeedArticleRepository : JpaRepository<FeedArticle, UUID> {
    fun existsBySourceIdAndGuid(sourceId: UUID, guid: String): Boolean
    fun findTop50ByOrderByPublishedAtDesc(): List<FeedArticle>
}
