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
 * - null or zero P&L → remove any existing movement (open / break-even / reopened / **deleted**
 *   trade — no balance impact, and `amount = 0` would violate the `account_movement` CHECK anyway).
 *
 * Editing or removing an existing movement also re-floats the latest balance correction (via
 * [AccountReconciler]) — a change to a trade's P&L moves the balance just like editing a deposit. A
 * brand-new trade's P&L is a real move, not a mistake to absorb, so it does **not** re-float. Trade
 * deletion now arrives here as a null-P&L event (published by `TradeEntryService.delete`) ; the DB
 * `ON DELETE CASCADE` on `trade_entry_id` is left as a safety net.
 *
 * [UserRepository.getReferenceById] yields a lazy proxy : we only need the FK to set `user_id`, not
 * a full load. The owner is always the trade's owner (carried on the event).
 */
@Service
class AccountTradeSyncService(
  private val repo: AccountMovementRepository,
  private val userRepository: UserRepository,
  private val reconciler: AccountReconciler,
) {

  @Transactional
  fun sync(event: TradeChangedEvent) {
    val existing = repo.findByTradeEntryId(event.tradeId)
    val pnl = event.profitDollars
    if (pnl == null || pnl.signum() == 0) {
      // Trade went open / break-even (or its P&L row is being removed) — a change to an existing
      // balance line, so re-float the latest correction. A no-op (never had a row) leaves it alone.
      if (existing != null) {
        repo.delete(existing)
        reconciler.reconcile(event.userId)
      }
      return
    }
    if (existing != null) {
      existing.amount = pnl
      existing.valueDate = event.tradeDate
      existing.note = event.ticker
      existing.updatedAt = Instant.now()
      repo.save(existing)
      // Editing a trade's realized P&L moves the balance → re-float the latest correction.
      reconciler.reconcile(event.userId)
    } else {
      // Brand-new trade P&L is a real balance move, not a mistake to absorb — don't re-float.
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
