package com.portfolioai.analysis.application

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.portfolioai.analysis.application.dto.NarrativeObservationDto
import com.portfolioai.analysis.application.dto.NarrativeObservationsResponse
import com.portfolioai.analysis.application.dto.TickerObservationIndexDto
import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.analysis.infrastructure.persistence.NarrativeObservabilityQuery
import com.portfolioai.analysis.infrastructure.persistence.NarrativeObservationRow
import com.portfolioai.market.domain.MarketUnavailableException
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.infrastructure.market.MarketChartClient
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

/**
 * Phase 3 #1 — backend for the « narrative vs price » observability page. Returns each past
 * narrative on [symbol] paired with what the price did afterwards at 1d / 1w / 1m horizons. The
 * page reads this and renders a reverse-chronological timeline of cards, each card with a
 * tri-colored delta strip.
 *
 * **Cost** : exactly one [MarketChartClient.fetchChart] call per request (1Y daily). Cache-friendly
 * : the same `(symbol, "1y", "1d")` key is hit by the dossier ticker route, so opening this page
 * right after browsing the symbol's dossier is free. We never re-fetch per-snapshot — bars are
 * loaded once and reused for all rows in the timeline.
 *
 * **Graceful degradation** : if the market provider is unreachable ([MarketUnavailableException]),
 * the response still carries the narratives — only the price-since fields are null. The user came
 * to read history ; we don't 503 them just because the upstream blinked. The page is responsible
 * for rendering an « price action unavailable » hint when all deltas are null on a long-enough
 * series (the heuristic « should we have data for this row » is UI-side, not service-side).
 */
@Service
class NarrativeObservabilityService(
  private val query: NarrativeObservabilityQuery,
  private val chartClient: MarketChartClient,
) {
  private val log = LoggerFactory.getLogger(javaClass)
  private val mapper = jacksonObjectMapper()

  fun findFor(
    symbol: String,
    from: Instant? = null,
    to: Instant? = null,
    promptTemplateId: UUID? = null,
  ): NarrativeObservationsResponse {
    val normalised = symbol.trim().uppercase()
    val rows = query.find(normalised, from, to, promptTemplateId)
    if (rows.isEmpty()) {
      return NarrativeObservationsResponse(symbol = normalised, observations = emptyList())
    }

    // Single fetch for the whole timeline — cached upstream, free on the warm path.
    val bars: List<OhlcBar> =
      try {
        chartClient.fetchChart(normalised, range = "1y", interval = "1d").bars
      } catch (e: MarketUnavailableException) {
        log.warn(
          "Market upstream unavailable while enriching observability for symbol={} — returning {} observations with null deltas",
          normalised,
          rows.size,
          e,
        )
        emptyList()
      }

    val observations = rows.map { row -> mapToDto(normalised, row, bars) }
    return NarrativeObservationsResponse(symbol = normalised, observations = observations)
  }

  /**
   * Phase 3 #1 PR3 — index of tickers that have at least one persisted narrative. Backs `GET
   * /api/narrative/observability/tickers` for the `/observability` landing page. No enrichment, no
   * market fetch — pure DB read.
   */
  fun listTickers(): List<TickerObservationIndexDto> =
    query.findTickers().map { row ->
      TickerObservationIndexDto(
        symbol = row.symbol,
        snapshotCount = row.snapshotCount,
        lastGeneratedAt = row.lastGeneratedAt,
      )
    }

  private fun mapToDto(
    symbol: String,
    row: NarrativeObservationRow,
    bars: List<OhlcBar>,
  ): NarrativeObservationDto {
    val keyPoints: List<String> =
      mapper.readValue(row.keyPointsJson, Array<String>::class.java).toList()
    val sentiment = Sentiment.valueOf(row.sentiment)
    val generatedDate = row.generatedAt.atOffset(ZoneOffset.UTC).toLocalDate()
    val priceAt1d = priceAtOrAfter(bars, generatedDate.plusDays(1))
    val priceAt1w = priceAtOrAfter(bars, generatedDate.plusDays(7))
    val priceAt1m = priceAtOrAfter(bars, generatedDate.plusDays(30))
    return NarrativeObservationDto(
      snapshotId = row.snapshotId,
      symbol = symbol,
      generatedAt = row.generatedAt,
      price = row.price,
      summary = row.summary,
      sentiment = sentiment,
      keyPoints = keyPoints,
      modelUsed = row.modelUsed,
      promptVersion = row.promptVersion,
      promptTemplateId = row.promptTemplateId,
      promptName = row.promptName,
      promptTemplateVersion = row.promptTemplateVersion,
      thumbsValue = row.thumbsValue,
      priceAt1d = priceAt1d,
      priceAt1w = priceAt1w,
      priceAt1m = priceAt1m,
      delta1d = delta(row.price, priceAt1d),
      delta1w = delta(row.price, priceAt1w),
      delta1m = delta(row.price, priceAt1m),
    )
  }

  /**
   * Returns the close of the first bar at or after [target], or `null` if no such bar exists. The «
   * at or after » semantics handle weekends + holidays naturally : a snapshot generated Friday with
   * `+1d = Saturday` lands on Monday's close, which is the right « next trading day » price.
   *
   * Assumes [bars] are sorted oldest → newest, which matches both
   * [com.portfolioai.market.infrastructure.market.MockMarketChartClient] and
   * [com.portfolioai.market.infrastructure.market.TwelveDataClient] (the indicator calculator
   * downstream depends on the same invariant).
   */
  private fun priceAtOrAfter(bars: List<OhlcBar>, target: LocalDate): BigDecimal? {
    val bar = bars.firstOrNull { it.timestamp.atOffset(ZoneOffset.UTC).toLocalDate() >= target }
    return bar?.close
  }

  /**
   * Fractional change from [base] to [future], e.g. `0.0234` = +2.34 %. `null` when [future] is
   * null or [base] is non-positive (defensive — `price` is `NUMERIC(18,4) NOT NULL` so a zero is
   * theoretically possible only on bad data, but dividing by it would NaN the whole row).
   */
  private fun delta(base: BigDecimal, future: BigDecimal?): BigDecimal? {
    if (future == null) return null
    if (base.signum() <= 0) return null
    return future.subtract(base).divide(base, DELTA_SCALE, RoundingMode.HALF_UP)
  }

  companion object {
    private const val DELTA_SCALE = 4
  }
}
