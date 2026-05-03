package com.portfolioai.market.infrastructure.http

import com.portfolioai.market.application.TickerService
import com.portfolioai.market.application.dto.TickerSnapshotDto
import com.portfolioai.market.application.dto.toDto
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/market/ticker")
class MarketController(private val tickerService: TickerService) {

  /**
   * Returns the full ticker dossier for [symbol] : current quote, computed indicators, and the OHLC
   * series used to compute them. Source : the configured `market.provider` (Twelve Data by default
   * in prod, mock in CI / fresh clones).
   */
  @GetMapping("/{symbol}")
  fun getTicker(@PathVariable symbol: String): TickerSnapshotDto =
    tickerService.load(symbol).toDto()
}
