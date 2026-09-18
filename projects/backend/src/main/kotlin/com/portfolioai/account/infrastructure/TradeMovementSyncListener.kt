package com.portfolioai.account.infrastructure

import com.portfolioai.account.application.AccountTradeSyncService
import com.portfolioai.journal.application.TradeChangedEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

/**
 * Bridges the journal's [TradeChangedEvent] to [AccountTradeSyncService].
 *
 * **Synchronous, same transaction** as the journal write : the event is delivered inline during
 * `TradeEntryService.create / update / import`, so the trade and its account movement commit (or
 * roll back) together — no eventual-consistency window. `TradeEntryService` flushes the trade
 * (`saveAndFlush`) before publishing, so the trade row exists in the transaction before the
 * movement's FK (`account_movement.trade_entry_id`) is written.
 *
 * Delegates to a separate `@Transactional` bean rather than annotating this method directly — a
 * self-invocation would bypass Spring's transactional proxy (cf. CLAUDE.md). A failure here rolls
 * back the whole operation : if the ledger can't record the trade's P&L, the trade write fails too,
 * keeping journal and account consistent.
 */
@Component
class TradeMovementSyncListener(private val syncService: AccountTradeSyncService) {

  @EventListener fun onTradeChanged(event: TradeChangedEvent) = syncService.sync(event)
}
