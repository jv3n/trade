package com.portfolioai.daybars.application.dto

import com.portfolioai.daybars.domain.Bar
import com.portfolioai.daybars.domain.DayHalt
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
  val halts: List<HaltDto> = emptyList(),
)

data class HaltDto(
  val haltedAt: Instant,
  val reopenedAt: Instant,
  val lastClose: BigDecimal,
  val reopenPrice: BigDecimal,
)

data class BarDto(
  val time: Instant,
  val open: BigDecimal,
  val high: BigDecimal,
  val low: BigDecimal,
  val close: BigDecimal,
  val volume: Long,
)

fun DayHalt.toDto() = HaltDto(haltedAt, reopenedAt, lastClose, reopenPrice)

fun Bar.toDto() = BarDto(time, open, high, low, close, volume)

fun BarDto.toDomain() = Bar(time, open, high, low, close, volume)
