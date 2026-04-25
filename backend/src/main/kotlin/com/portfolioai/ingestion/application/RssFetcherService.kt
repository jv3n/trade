package com.portfolioai.ingestion.application

import com.portfolioai.ingestion.domain.FeedArticle
import com.portfolioai.ingestion.domain.FeedCategory
import com.portfolioai.ingestion.domain.FeedSource
import com.portfolioai.ingestion.infrastructure.persistence.FeedArticleRepository
import com.portfolioai.ingestion.infrastructure.persistence.FeedSourceRepository
import com.rometools.rome.io.SyndFeedInput
import com.rometools.rome.io.XmlReader
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.net.URL

@Service
class RssFetcherService(
    private val sourceRepository: FeedSourceRepository,
    private val articleRepository: FeedArticleRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${ingestion.rss.interval-ms:900000}")
    fun fetchAll() {
        val sources = sourceRepository.findByEnabledTrue()
            .filter { it.category == FeedCategory.RSS }
        log.info("Ingestion RSS — {} source(s) activée(s)", sources.size)
        sources.forEach { fetchSource(it) }
    }

    @Transactional
    fun fetchSource(source: FeedSource) {
        try {
            val feed = SyndFeedInput().build(XmlReader(URL(source.url)))
            var newCount = 0
            feed.entries.forEach { entry ->
                val guid = entry.uri ?: entry.link ?: return@forEach
                if (!articleRepository.existsBySourceIdAndGuid(source.id, guid)) {
                    articleRepository.save(
                        FeedArticle(
                            source = source,
                            guid = guid,
                            title = entry.title?.trim() ?: "(sans titre)",
                            description = entry.description?.value?.trim(),
                            link = entry.link,
                            publishedAt = entry.publishedDate?.toInstant(),
                        )
                    )
                    newCount++
                }
            }
            log.info("[{}] {} nouvel(s) article(s) ingéré(s)", source.name, newCount)
        } catch (e: Exception) {
            log.error("[{}] Échec de la récupération RSS : {}", source.name, e.message)
        }
    }
}
