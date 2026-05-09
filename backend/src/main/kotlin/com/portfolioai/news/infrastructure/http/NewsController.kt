package com.portfolioai.news.infrastructure.http

import com.portfolioai.news.application.NewsService
import com.portfolioai.news.application.dto.NewsItemDto
import com.portfolioai.news.application.dto.toDto
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * Per-ticker news feed. Mirrors the URL shape of the existing market endpoints (under
 * `/api/market/ticker/{symbol}/...`) so the front can compose calls naturally — `getTicker(...)`,
 * `getChart(...)`, `getNews(...)` all live on the same prefix.
 *
 * Provider errors (Finnhub 503 / rate-limit / auth-failed) surface as HTTP 503 via the global
 * exception handler — same UX as Twelve Data : the dossier shows an inline error in the news panel
 * without breaking the rest of the page.
 */
@Tag(name = "News", description = "Per-ticker headlines (Finnhub-backed, 30-day rolling window)")
@RestController
@RequestMapping("/api/market/ticker")
class NewsController(private val service: NewsService) {

  @GetMapping("/{symbol}/news")
  fun list(
    @PathVariable symbol: String,
    @RequestParam(defaultValue = "10") limit: Int,
  ): List<NewsItemDto> = service.forSymbol(symbol, limit).map { it.toDto() }
}
