package com.portfolioai.portfolio.infrastructure.http

import com.portfolioai.portfolio.application.PortfolioQueryService
import com.portfolioai.portfolio.application.dto.AssetDto
import com.portfolioai.portfolio.application.dto.PortfolioDto
import java.util.UUID
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/portfolios")
class PortfolioController(private val portfolioQueryService: PortfolioQueryService) {

  @GetMapping fun findAll(): List<PortfolioDto> = portfolioQueryService.findAll()

  @GetMapping("/{id}")
  fun findById(@PathVariable id: UUID): PortfolioDto = portfolioQueryService.findById(id)

  @GetMapping("/{id}/assets")
  fun findAssets(@PathVariable id: UUID): List<AssetDto> = portfolioQueryService.findAssets(id)
}
