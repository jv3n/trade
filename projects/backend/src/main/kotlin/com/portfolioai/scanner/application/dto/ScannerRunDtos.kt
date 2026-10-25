package com.portfolioai.scanner.application.dto

import com.portfolioai.scanner.domain.ScannerRun
import com.portfolioai.stats.application.dto.ScannedStat
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** Body of `POST /api/scanner/stats` — what the scanner found on one trading day, GUS and DT. */
data class ScannedStatsRequest(val tradingDate: LocalDate, val stats: List<ScannedStat>)

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
