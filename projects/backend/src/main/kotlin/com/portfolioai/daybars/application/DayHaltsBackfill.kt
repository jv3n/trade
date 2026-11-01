package com.portfolioai.daybars.application

import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.dao.DataAccessException
import org.springframework.stereotype.Component

/**
 * Reads the halts of the days stored before they existed (#829), without a re-scan. Day by day, so
 * a failure costs one day, read again at the next start ; an exception here would stop the boot.
 */
@Component
class DayHaltsBackfill(private val service: DayBarsService) {

  private val log = LoggerFactory.getLogger(javaClass)

  @EventListener(ApplicationReadyEvent::class)
  fun run() {
    val days = service.daysWithHaltsUnread()
    days.forEach { day ->
      try {
        service.readHalts(day.tradingDate, day.ticker)
      } catch (e: DataAccessException) {
        log.warn("Halts of {} on {} not read", day.ticker, day.tradingDate, e)
      }
    }
    if (days.isNotEmpty()) log.info("Halts read on {} stored days", days.size)
  }
}
