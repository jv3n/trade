package com.portfolioai.earnings.application.dto

import com.portfolioai.earnings.domain.EarningsReport
import com.portfolioai.earnings.domain.EarningsSnapshot
import java.math.BigDecimal
import java.time.LocalDate

/** REST representation of [EarningsSnapshot]. Keeps the domain free of Jackson concerns. */
data class EarningsSnapshotDto(
  val symbol: String,
  val nextEarningsDate: LocalDate?,
  /** `BEFORE_MARKET` / `AFTER_MARKET` / `UNSPECIFIED` — the front maps each to a small label. */
  val nextEarningsTime: String?,
  val lastReports: List<EarningsReportDto>,
)

data class EarningsReportDto(
  val period: LocalDate,
  val epsEstimate: BigDecimal?,
  val epsActual: BigDecimal?,
  val surprisePercent: BigDecimal?,
)

fun EarningsSnapshot.toDto(): EarningsSnapshotDto =
  EarningsSnapshotDto(
    symbol = symbol,
    nextEarningsDate = nextEarningsDate,
    nextEarningsTime = nextEarningsTime?.name,
    lastReports = lastReports.map { it.toDto() },
  )

private fun EarningsReport.toDto() =
  EarningsReportDto(
    period = period,
    epsEstimate = epsEstimate,
    epsActual = epsActual,
    surprisePercent = surprisePercent,
  )
