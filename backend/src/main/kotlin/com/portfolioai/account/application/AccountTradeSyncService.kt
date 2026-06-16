package com.portfolioai.account.application

import com.portfolioai.account.domain.AccountMovement
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.application.TradeChangedEvent
import java.time.Instant
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Reconciles a journal trade's realized P&L into the account ledger as a read-only `TRADE`
 * movement. Driven by `TradeMovementSyncListener` after the journal transaction commits. The upsert
 * is keyed on `tradeEntryId` (the DB has a partial unique index) :
 * - realized P&L present & non-zero → create or update the movement (amount = P&L) ;
 * - null or zero P&L → remove any existing movement (open / break-even / reopened trade — no
 *   balance impact, and `amount = 0` would violate the `account_movement` CHECK anyway).
 *
 * Trade deletion isn't handled here — the DB `ON DELETE CASCADE` on `trade_entry_id` covers it.
 *
 * [UserRepository.getReferenceById] yields a lazy proxy : we only need the FK to set `user_id`, not
 * a full load. The owner is always the trade's owner (carried on the event).
 */
@Service
class AccountTradeSyncService(
  private val repo: AccountMovementRepository,
  private val userRepository: UserRepository,
) {

  @Transactional
  fun sync(event: TradeChangedEvent) {
    val existing = repo.findByTradeEntryId(event.tradeId)
    val pnl = event.profitDollars
    if (pnl == null || pnl.signum() == 0) {
      if (existing != null) repo.delete(existing)
      return
    }
    if (existing != null) {
      existing.amount = pnl
      existing.valueDate = event.tradeDate
      existing.note = event.ticker
      existing.updatedAt = Instant.now()
      repo.save(existing)
    } else {
      repo.save(
        AccountMovement(
          user = userRepository.getReferenceById(event.userId),
          type = AccountMovementType.TRADE,
          amount = pnl,
          valueDate = event.tradeDate,
          note = event.ticker,
          tradeEntryId = event.tradeId,
        )
      )
    }
  }
}
