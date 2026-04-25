package com.portfolioai.backend.ingestion

import org.springframework.data.repository.findByIdOrNull
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.time.Instant
import java.util.UUID

data class FeedSourceDto(
    val id: UUID,
    val slug: String,
    val name: String,
    val url: String,
    val category: FeedCategory,
    val enabled: Boolean,
    val description: String,
    val free: Boolean,
    val requiresApiKey: Boolean,
)

data class UpdateSourceEnabledRequest(val enabled: Boolean)

data class FeedArticleDto(
    val id: UUID,
    val sourceName: String,
    val title: String,
    val description: String?,
    val link: String?,
    val publishedAt: Instant?,
    val fetchedAt: Instant,
)

fun FeedSource.toDto() = FeedSourceDto(id, slug, name, url, category, enabled, description, free, requiresApiKey)
fun FeedArticle.toDto() = FeedArticleDto(id, source.name, title, description, link, publishedAt, fetchedAt)

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
