package com.portfolioai.screener.infrastructure.http

import com.portfolioai.screener.application.MarketScreenerService
import com.portfolioai.screener.application.dto.TickerMoverDto
import com.portfolioai.screener.application.dto.toDto
import com.portfolioai.screener.domain.ScreenerFilter
import com.portfolioai.screener.domain.ScreenerUniverse
import io.swagger.v3.oas.annotations.tags.Tag
import java.math.BigDecimal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * Market radar endpoint (Phase 6). Returns the list of tickers in the configured universe (Nasdaq
 * Composite mid-cap, $2B–$10B) whose current session shows an abnormal move — gap % and / or volume
 * disproportion vs the 30-day average — above the user-supplied thresholds.
 *
 * Defaults align with the Phase 6 kick-off decision (`gapPctMin = 5`, `volumeRatioMin = 3`) so a
 * caller without any query params still gets a sensible v1 radar.
 *
 * Errors flow through the global exception handler — a 503 means the upstream snapshot failed, an
 * empty list (200 OK with `[]`) is a *valid* result that means "nothing matches right now".
 */
@Tag(name = "Screener", description = "Market radar — tickers showing abnormal moves at the open")
@RestController
@RequestMapping("/api/screener")
class MarketScreenerController(private val service: MarketScreenerService) {

  @GetMapping("/movers")
  fun movers(
    @RequestParam(defaultValue = "5.0") gapPctMin: BigDecimal,
    @RequestParam(defaultValue = "3.0") volumeRatioMin: BigDecimal,
    @RequestParam(required = false) marketCapMin: Long?,
    @RequestParam(required = false) marketCapMax: Long?,
    @RequestParam(required = false) exchange: String?,
    @RequestParam(required = false) sector: String?,
  ): List<TickerMoverDto> {
    val filter =
      ScreenerFilter(
        gapPctMin = gapPctMin,
        volumeRatioMin = volumeRatioMin,
        marketCapMin = marketCapMin,
        marketCapMax = marketCapMax,
        exchange = exchange,
        sector = sector,
      )
    return service.findMovers(ScreenerUniverse.NASDAQ_MID_CAP, filter).map { it.toDto() }
  }
}
