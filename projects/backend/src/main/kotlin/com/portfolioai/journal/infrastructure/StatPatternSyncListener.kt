package com.portfolioai.journal.infrastructure

import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.stats.application.StatPatternChangedEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

/**
 * Bridges the stats' [StatPatternChangedEvent] to [TradeEntryService] : the trade born from a stat
 * takes its new pattern (#393). Synchronous, in the stat update's transaction, so the stat and its
 * trade commit together. Delegates to the service rather than being `@Transactional` itself — a
 * self-invocation would bypass the proxy.
 */
@Component
class StatPatternSyncListener(private val tradeEntryService: TradeEntryService) {

  @EventListener
  fun onStatPatternChanged(event: StatPatternChangedEvent) =
    tradeEntryService.followStatPattern(event.statEntryId, event.userId, event.pattern)
}
