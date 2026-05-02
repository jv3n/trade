package com.portfolioai.ingestion.application

import com.portfolioai.ingestion.application.dto.RawArticleDto
import com.portfolioai.ingestion.application.dto.SourceTestResultDto
import com.portfolioai.ingestion.domain.FeedArticle
import com.portfolioai.ingestion.domain.FeedCategory
import com.portfolioai.ingestion.domain.FeedSource
import com.portfolioai.ingestion.infrastructure.persistence.FeedArticleRepository
import com.portfolioai.ingestion.infrastructure.persistence.FeedSourceRepository
import com.rometools.rome.feed.synd.SyndFeed
import com.rometools.rome.io.SyndFeedInput
import java.io.StringReader
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.xml.sax.InputSource

@Service
class RssFetcherService(
  private val sourceRepository: FeedSourceRepository,
  private val articleRepository: FeedArticleRepository,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Scheduled(fixedDelayString = "\${ingestion.rss.interval-ms:900000}")
  fun fetchAll() {
    val sources = sourceRepository.findByEnabledTrue().filter { it.category == FeedCategory.RSS }
    log.info("Ingestion RSS — {} source(s) activée(s)", sources.size)
    sources.forEach { fetchSource(it) }
  }

  fun testFetch(source: FeedSource): SourceTestResultDto {
    return if (source.category == FeedCategory.RSS) testRss(source)
    else testHttpReachability(source)
  }

  private fun testRss(source: FeedSource): SourceTestResultDto {
    return try {
      val feed = fetchFeed(source.url)
      val items =
        feed.entries.map { entry ->
          RawArticleDto(
            title = entry.title?.trim() ?: "(sans titre)",
            link = entry.link,
            publishedAt = entry.publishedDate?.toInstant(),
          )
        }
      SourceTestResultDto(
        ok = true,
        error = null,
        message = null,
        itemCount = items.size,
        items = items,
      )
    } catch (e: UnknownHostException) {
      SourceTestResultDto(
        ok = false,
        error = "Hôte introuvable : ${e.message}",
        message = null,
        itemCount = 0,
        items = emptyList(),
      )
    } catch (e: ConnectException) {
      SourceTestResultDto(
        ok = false,
        error = "Connexion refusée par ${source.url}",
        message = null,
        itemCount = 0,
        items = emptyList(),
      )
    } catch (e: SocketTimeoutException) {
      SourceTestResultDto(
        ok = false,
        error = "Timeout — la source ne répond pas",
        message = null,
        itemCount = 0,
        items = emptyList(),
      )
    } catch (e: Exception) {
      SourceTestResultDto(
        ok = false,
        error = "${e.javaClass.simpleName} : ${e.message}",
        message = null,
        itemCount = 0,
        items = emptyList(),
      )
    }
  }

  private fun testHttpReachability(source: FeedSource): SourceTestResultDto =
    SourceTestResultDto(
      ok = true,
      error = null,
      message = "Source ${source.category} — intégration API à configurer",
      itemCount = 0,
      items = emptyList(),
    )

  private fun fetchFeed(url: String): SyndFeed {
    val conn = URL(url).openConnection()
    conn.setRequestProperty(
      "User-Agent",
      "Mozilla/5.0 (compatible; PortfolioAI/1.0; +https://github.com/portfolioai)",
    )
    conn.setRequestProperty("Accept", "application/rss+xml, application/xml, text/xml, */*")
    val raw = conn.getInputStream().bufferedReader().readText()
    val trimmed = raw.trimStart()
    if (
      trimmed.startsWith("<!DOCTYPE html", ignoreCase = true) ||
        trimmed.startsWith("<html", ignoreCase = true)
    ) {
      throw IllegalStateException("La source retourne une page HTML — URL obsolète ou accès bloqué")
    }
    // Fix bare & not part of a valid XML entity (common in some feeds)
    val healed = raw.replace(Regex("&(?!(amp|lt|gt|quot|apos|#\\d+|#x[0-9a-fA-F]+);)"), "&amp;")
    return SyndFeedInput()
      .also { it.isAllowDoctypes = true }
      .build(InputSource(StringReader(healed)))
  }

  @Transactional
  fun fetchSource(source: FeedSource) {
    try {
      val feed = fetchFeed(source.url)
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
