package com.portfolioai.ingestion.infrastructure.persistence

import com.portfolioai.ingestion.domain.FeedArticle
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface FeedArticleRepository : JpaRepository<FeedArticle, UUID> {
  fun existsBySourceIdAndGuid(sourceId: UUID, guid: String): Boolean

  fun findTop50ByOrderByPublishedAtDesc(): List<FeedArticle>
}
