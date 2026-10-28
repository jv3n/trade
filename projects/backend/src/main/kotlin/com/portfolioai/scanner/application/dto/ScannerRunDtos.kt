package com.portfolioai.scanner.application.dto

import com.portfolioai.daybars.application.dto.BarDto
import com.portfolioai.scanner.domain.ScannerRun
import com.portfolioai.stats.application.dto.ScannedStat
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * Body of `POST /api/scanner/stats` — what the scanner found on one trading day, GUS and DT, with
 * the day's 1-min bars of their tickers (#798) : a ticker without a stat in the batch is a 400.
 */
data class ScannedStatsRequest(
  val tradingDate: LocalDate,
  val stats: List<ScannedStat>,
  val bars: List<ScannedTickerBars> = emptyList(),
)

/** One ticker's bars on the batch's day. */
data class ScannedTickerBars(val ticker: String, val bars: List<BarDto>)

/** Body of `POST /api/scanner/bars` — a missing ticker-day the scanner fetched (#798). */
data class DayBarsRequest(val tradingDate: LocalDate, val ticker: String, val bars: List<BarDto>)

/**
 * Body of `POST /api/scanner/runs` — one run as the scanner reports it ; [error] when it failed,
 * [missedTickers] when it went on without some (#779).
 */
data class ScannerRunRequest(
  val tradingDate: LocalDate,
  val startedAt: Instant,
  val finishedAt: Instant? = null,
  val tickersScanned: Int,
  val gusFound: Int,
  val dtFound: Int,
  val error: String? = null,
  val missedTickers: List<String> = emptyList(),
)

data class ScannerRunDto(
  val id: UUID,
  val tradingDate: LocalDate,
  val startedAt: Instant,
  val finishedAt: Instant?,
  val tickersScanned: Int,
  val gusFound: Int,
  val dtFound: Int,
  val error: String?,
  val missedTickers: List<String>,
)

fun ScannerRun.toDto() =
  ScannerRunDto(
    id = id,
    tradingDate = tradingDate,
    startedAt = startedAt,
    finishedAt = finishedAt,
    tickersScanned = tickersScanned,
    gusFound = gusFound,
    dtFound = dtFound,
    error = error,
    missedTickers = missedTickers?.split(",").orEmpty(),
  )
