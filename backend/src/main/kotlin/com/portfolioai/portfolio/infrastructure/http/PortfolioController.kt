package com.portfolioai.portfolio.infrastructure.http

import com.portfolioai.portfolio.application.PortfolioQueryService
import com.portfolioai.portfolio.application.dto.AssetDto
import com.portfolioai.portfolio.application.dto.OwnedTickerDto
import com.portfolioai.portfolio.application.dto.PortfolioDto
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@Tag(
  name = "Portfolio",
  description =
    "Read-only portfolios (mirror the broker's reality), positions and owned-tickers shortcuts",
)
@RestController
@RequestMapping("/api/portfolios")
class PortfolioController(private val portfolioQueryService: PortfolioQueryService) {

  @GetMapping fun findAll(): List<PortfolioDto> = portfolioQueryService.findAll()

  /** Distinct tickers across all portfolios — backs the dashboard sidebar shortcut. */
  @GetMapping("/owned-tickers")
  fun findOwnedTickers(): List<OwnedTickerDto> = portfolioQueryService.findOwnedTickers()

  @GetMapping("/{id}")
  fun findById(@PathVariable id: UUID): PortfolioDto = portfolioQueryService.findById(id)

  @GetMapping("/{id}/assets")
  fun findAssets(@PathVariable id: UUID): List<AssetDto> = portfolioQueryService.findAssets(id)
}
