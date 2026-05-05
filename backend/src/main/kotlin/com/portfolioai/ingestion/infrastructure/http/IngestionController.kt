package com.portfolioai.ingestion.infrastructure.http

import com.portfolioai.ingestion.application.RssFetcherService
import com.portfolioai.ingestion.application.dto.FeedArticleDto
import com.portfolioai.ingestion.application.dto.FeedSourceDto
import com.portfolioai.ingestion.application.dto.SourceTestResultDto
import com.portfolioai.ingestion.application.dto.UpdateSourceEnabledRequest
import com.portfolioai.ingestion.application.dto.toDto
import com.portfolioai.ingestion.infrastructure.persistence.FeedArticleRepository
import com.portfolioai.ingestion.infrastructure.persistence.FeedSourceRepository
import java.util.UUID
import org.springframework.data.repository.findByIdOrNull
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/ingestion")
class IngestionController(
  private val sourceRepository: FeedSourceRepository,
  private val articleRepository: FeedArticleRepository,
  private val rssFetcherService: RssFetcherService,
) {
  @GetMapping("/sources")
  fun getSources(): List<FeedSourceDto> = sourceRepository.findAll().map { it.toDto() }

  @GetMapping("/articles")
  fun getLatestArticles(): List<FeedArticleDto> =
    articleRepository.findTop50ByOrderByPublishedAtDesc().map { it.toDto() }

  @PatchMapping("/sources/{id}")
  @Transactional
  fun updateSourceEnabled(
    @PathVariable id: UUID,
    @RequestBody body: UpdateSourceEnabledRequest,
  ): FeedSourceDto {
    val source =
      sourceRepository.findByIdOrNull(id) ?: throw NoSuchElementException("Source $id not found")
    source.enabled = body.enabled
    return source.toDto()
  }

  @GetMapping("/sources/{id}/test")
  fun testSource(@PathVariable id: UUID): SourceTestResultDto {
    val source =
      sourceRepository.findByIdOrNull(id) ?: throw NoSuchElementException("Source $id not found")
    return rssFetcherService.testFetch(source)
  }

  @PostMapping("/fetch")
  @ResponseStatus(HttpStatus.ACCEPTED)
  fun triggerFetch() {
    rssFetcherService.fetchAll()
  }
}
