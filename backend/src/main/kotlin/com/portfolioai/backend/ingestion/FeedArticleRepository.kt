package com.portfolioai.backend.ingestion

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FeedArticleRepository : JpaRepository<FeedArticle, UUID> {
    fun existsBySourceIdAndGuid(sourceId: UUID, guid: String): Boolean
    fun findTop50ByOrderByPublishedAtDesc(): List<FeedArticle>
}
