package com.portfolioai.daybars.application.dto

import com.portfolioai.daybars.domain.Bar
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/** What a stat's chart card shows (#784) : its bars, « not yet », or « none served ». */
enum class DayChartState {
  FOUND,
  /** Not fetched yet — a stat of the day gets its bars at the scanner's next run. */
  PENDING,
  NOT_FOUND,
}

/** The chart of a stat's ticker-day ; [bars] is empty unless [state] is `FOUND`. */
data class DayChartDto(
  val tradingDate: LocalDate,
  val ticker: String,
  val state: DayChartState,
  val bars: List<BarDto> = emptyList(),
)

data class BarDto(
  val time: Instant,
  val open: BigDecimal,
  val high: BigDecimal,
  val low: BigDecimal,
  val close: BigDecimal,
  val volume: Long,
)

fun Bar.toDto() = BarDto(time, open, high, low, close, volume)

fun BarDto.toDomain() = Bar(time, open, high, low, close, volume)
