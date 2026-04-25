package com.portfolioai.ingestion.infrastructure.http

import com.portfolioai.ingestion.application.RssFetcherService
import com.portfolioai.ingestion.application.dto.FeedArticleDto
import com.portfolioai.ingestion.application.dto.FeedSourceDto
import com.portfolioai.ingestion.application.dto.UpdateSourceEnabledRequest
import com.portfolioai.ingestion.application.dto.toDto
import com.portfolioai.ingestion.infrastructure.persistence.FeedArticleRepository
import com.portfolioai.ingestion.infrastructure.persistence.FeedSourceRepository
import org.springframework.data.repository.findByIdOrNull
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/ingestion")
class IngestionController(
    private val sourceRepository: FeedSourceRepository,
    private val articleRepository: FeedArticleRepository,
    private val rssFetcherService: RssFetcherService,
) {
    @GetMapping("/sources")
    fun getSources(): List<FeedSourceDto> =
        sourceRepository.findAll().map { it.toDto() }

    @GetMapping("/articles")
    fun getLatestArticles(): List<FeedArticleDto> =
        articleRepository.findTop50ByOrderByPublishedAtDesc().map { it.toDto() }

    @PatchMapping("/sources/{id}")
    @Transactional
    fun updateSourceEnabled(@PathVariable id: UUID, @RequestBody body: UpdateSourceEnabledRequest): FeedSourceDto {
        val source = sourceRepository.findByIdOrNull(id)
            ?: throw NoSuchElementException("Source $id not found")
        source.enabled = body.enabled
        return source.toDto()
    }

    @PostMapping("/fetch")
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun triggerFetch() {
        rssFetcherService.fetchAll()
    }
}
