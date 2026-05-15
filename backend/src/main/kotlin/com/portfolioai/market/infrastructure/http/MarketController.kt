package com.portfolioai.market.infrastructure.http

import com.portfolioai.market.application.SectorClassifierService
import com.portfolioai.market.application.TickerService
import com.portfolioai.market.application.dto.ChartDto
import com.portfolioai.market.application.dto.SectorBenchmarkDto
import com.portfolioai.market.application.dto.TickerSnapshotDto
import com.portfolioai.market.application.dto.toDto
import com.portfolioai.market.domain.Timeframe
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(
  name = "Market",
  description = "Per-ticker dossier : quote, computed indicators, OHLC bars, sector benchmark",
)
@RestController
@RequestMapping("/api/market/ticker")
class MarketController(
  private val tickerService: TickerService,
  private val sectorClassifierService: SectorClassifierService,
) {

  /**
   * Returns the full ticker dossier for [symbol] : current quote, computed indicators, and the OHLC
   * series used to compute them. Source : the configured `market.provider` (Twelve Data by default
   * in prod, mock in CI / fresh clones).
   *
   * The dossier is **always 1Y daily** — that's the reference view the indicators and the LLM
   * narrative are anchored on. The chart toggle on the front uses [getChart] for shorter / longer
   * windows without disturbing the indicators or the narrative.
   */
  @GetMapping("/{symbol}")
  fun getTicker(@PathVariable symbol: String): TickerSnapshotDto =
    tickerService.load(symbol).toDto()

  /**
   * Returns just the OHLC bars for [symbol] at the requested [timeframe] code. Used by the chart
   * toggle on the dossier page : the user clicks `1M` / `5Y` / etc., the front re-fetches only the
   * bars without recomputing indicators or re-prompting the LLM.
   *
   * [timeframe] is one of the codes defined in [Timeframe] (`1d`, `5d`, `1mo`, `3mo`, `1y`, `5y`).
   * Unknown codes return HTTP 400 via the [com.portfolioai.shared.GlobalExceptionHandler] — that's
   * deliberate, we don't want unbounded `range`/`interval` strings polluting the cache key.
   *
   * The default `timeframe=1y` matches the dossier's reference view, so a chart fetch without an
   * explicit timeframe equals what's already drawn on initial load.
   */
  @GetMapping("/{symbol}/chart")
  fun getChart(
    @PathVariable symbol: String,
    @RequestParam(defaultValue = "1y") timeframe: String,
  ): ChartDto {
    val tf = Timeframe.fromCode(timeframe)
    val bars = tickerService.loadBars(symbol, tf)
    return ChartDto(
      symbol = symbol.uppercase(),
      timeframe = tf.code,
      range = tf.range,
      interval = tf.interval,
      bars = bars.map { it.toDto() },
    )
  }

  /**
   * Resolves [symbol] to the SPDR sector ETF that tracks its GICS sector — backs the "Sector"
   * benchmark overlay on the chart. The frontend then re-uses [getChart] with
   * [SectorBenchmarkDto.etfSymbol] to fetch the actual bars, so this endpoint is a small lookup,
   * not a chart-data endpoint.
   *
   * 404 surfaces both "symbol unknown to the provider" and "sector outside the SPDR mapping" — from
   * the user's POV both result in "no benchmark available", and the inline UI message is the same.
   * 503 (rate-limit / unreachable) propagates from [UpstreamUnavailableException].
   */
  @GetMapping("/{symbol}/sector-benchmark")
  fun getSectorBenchmark(@PathVariable symbol: String): SectorBenchmarkDto {
    // Normalise once at the boundary, then propagate the same uppercase form to the service (cache
    // key + adapter call) and the DTO. Avoids the three-way duplication that used to live across
    // the controller / SpEL key / adapter (audit 2026-05-06 finding "coutures benchmark v2").
    val upper = symbol.trim().uppercase()
    return sectorClassifierService.classify(upper).toDto(upper)
  }
}
