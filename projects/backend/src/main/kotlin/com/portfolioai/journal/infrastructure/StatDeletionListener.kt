package com.portfolioai.journal.infrastructure

import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.stats.application.StatDeletedEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

/**
 * Bridges the stats' [StatDeletedEvent] to [TradeEntryService] : the trades of a deleted stat are
 * unlinked, never deleted (#635). Synchronous, in the stat deletion's transaction — the `ON DELETE
 * RESTRICT` FK would refuse the stat otherwise.
 */
@Component
class StatDeletionListener(private val tradeEntryService: TradeEntryService) {

  @EventListener
  fun onStatDeleted(event: StatDeletedEvent) =
    tradeEntryService.detachFromStat(event.statEntryId, event.userId)
}
