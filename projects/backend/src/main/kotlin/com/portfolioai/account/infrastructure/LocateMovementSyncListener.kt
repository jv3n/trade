package com.portfolioai.account.infrastructure

import com.portfolioai.account.application.AccountLocateSyncService
import com.portfolioai.locate.application.LocateChangedEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

/**
 * Bridges the `locate` context's [LocateChangedEvent] to [AccountLocateSyncService] — synchronous,
 * same transaction, like `TradeMovementSyncListener` : a locate and its account line commit or roll
 * back together.
 */
@Component
class LocateMovementSyncListener(private val syncService: AccountLocateSyncService) {

  @EventListener fun onLocateChanged(event: LocateChangedEvent) = syncService.sync(event)
}
