package com.portfolioai.daybars.application

import com.portfolioai.daybars.application.dto.DayChartDto
import com.portfolioai.daybars.application.dto.DayChartState
import com.portfolioai.daybars.application.dto.toDto
import com.portfolioai.daybars.domain.Bar
import com.portfolioai.daybars.domain.DayBars
import com.portfolioai.daybars.domain.DayBarsStatus
import com.portfolioai.daybars.infrastructure.persistence.DayBarsRepository
import com.portfolioai.shared.badRequest
import com.portfolioai.stats.application.StatEntryService
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * The day's 1-min bars behind every stat's chart (#784). They are market data : stored once per
 * (day, ticker) whoever's stat they serve, and read through a stat its owner can see — a foreign or
 * missing stat is a 404, as on the stats. ts-scanner pushes them (#798) ; storing again replaces.
 */
@Service
class DayBarsService(
  private val repo: DayBarsRepository,
  private val stats: StatEntryService,
  private val clock: Clock,
) {

  private val log = LoggerFactory.getLogger(javaClass)

  @Transactional(readOnly = true)
  fun chartOfStat(statId: UUID): DayChartDto {
    val stat = stats.findById(statId)
    return chartOf(stat.tradeDate, stat.ticker)
  }

  @Transactional(readOnly = true)
  fun chartOf(tradingDate: LocalDate, ticker: String): DayChartDto {
    val symbol = normalised(ticker)
    val row = repo.findByTradingDateAndTicker(tradingDate, symbol)
    return when (row?.status) {
      null -> DayChartDto(tradingDate, symbol, DayChartState.PENDING)
      DayBarsStatus.NOT_FOUND -> DayChartDto(tradingDate, symbol, DayChartState.NOT_FOUND)
      DayBarsStatus.FOUND ->
        DayChartDto(
          tradingDate,
          symbol,
          DayChartState.FOUND,
          BarsCodec.decode(checkNotNull(row.bars)).map { it.toDto() },
        )
    }
  }

  /**
   * Keeps [bars] for the ticker-day, in time order, one per minute : of two readings of a minute,
   * the **last pushed** wins — a later one is a correction. None, or a bar off the minute grid, is
   * a 400.
   */
  @Transactional
  fun store(tradingDate: LocalDate, ticker: String, bars: List<Bar>) {
    if (bars.isEmpty())
      throw ResponseStatusException(HttpStatus.BAD_REQUEST, "No bars : mark the day not found")
    bars
      .firstOrNull { it.time.epochSecond % SECONDS_A_MINUTE != 0L }
      ?.let { throw badRequest("A bar of $ticker at ${it.time} is off the minute grid") }
    val ordered = bars.associateBy { it.time }.values.sortedBy { it.time }
    save(tradingDate, ticker, DayBarsStatus.FOUND, BarsCodec.encode(ordered), ordered.size)
  }

  /** The provider served nothing for the ticker-day : the chart says so, and nobody asks again. */
  @Transactional
  fun markNotFound(tradingDate: LocalDate, ticker: String) {
    save(tradingDate, ticker, DayBarsStatus.NOT_FOUND, null, 0)
  }

  private fun save(
    tradingDate: LocalDate,
    ticker: String,
    status: DayBarsStatus,
    bars: ByteArray?,
    count: Int,
  ) {
    val symbol = normalised(ticker)
    val row =
      repo.findByTradingDateAndTicker(tradingDate, symbol)
        ?: DayBars(tradingDate = tradingDate, ticker = symbol, status = status)
    row.status = status
    row.bars = bars
    row.barCount = count
    row.fetchedAt = Instant.now(clock)
    repo.save(row)
    log.info("Day bars of {} on {} stored, status={}, bars={}", symbol, tradingDate, status, count)
  }

  private fun normalised(ticker: String) = ticker.trim().uppercase()

  private companion object {
    const val SECONDS_A_MINUTE = 60L
  }
}
