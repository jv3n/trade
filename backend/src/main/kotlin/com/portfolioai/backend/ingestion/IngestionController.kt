package com.portfolioai.backend.ingestion

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import java.time.Instant
import java.util.UUID

data class FeedSourceDto(
    val id: UUID,
    val name: String,
    val url: String,
    val category: FeedCategory,
    val enabled: Boolean,
)

data class FeedArticleDto(
    val id: UUID,
    val sourceName: String,
    val title: String,
    val description: String?,
    val link: String?,
    val publishedAt: Instant?,
    val fetchedAt: Instant,
)

fun FeedSource.toDto() = FeedSourceDto(id, name, url, category, enabled)
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

    @PostMapping("/fetch")
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun triggerFetch() {
        rssFetcherService.fetchAll()
    }
}
