package com.portfolioai.journal.domain

import com.portfolioai.shared.Pattern
import java.time.LocalDate
import java.util.UUID

/**
 * Port — the caller's stat on a (day, ticker, pattern), if any (#732) : a trade typed on its own
 * attaches to it. Implemented by the stats context ; a port rather than a call to its service,
 * which already depends on the journal.
 */
fun interface StatOfTheDay {
  fun find(userId: UUID, tradeDate: LocalDate, ticker: String, pattern: Pattern): UUID?
}
