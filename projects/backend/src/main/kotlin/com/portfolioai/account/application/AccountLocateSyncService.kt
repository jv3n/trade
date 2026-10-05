package com.portfolioai.account.application

import com.portfolioai.account.domain.AccountMovement
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.locate.application.LocateChangedEvent
import java.time.Instant
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Keeps a locate's cost in the account ledger as a read-only `LOCATE` movement, the way
 * [AccountTradeSyncService] does for a trade's P&L : driven by `LocateMovementSyncListener`,
 * synchronously and inside the locate's transaction, upserted on `locateId`.
 * - a cost above zero → create or update the movement (amount = −cost, dated the locate's day) ;
 * - a deletion, or a locate charged nothing → remove any existing movement (`amount = 0` would
 *   violate the `account_movement` CHECK).
 *
 * Every change goes through [AccountReconciler] : a locate dated before a reconciled morning is
 * absorbed by that morning, whose gap already counted what the broker charged.
 */
@Service
class AccountLocateSyncService(
  private val repo: AccountMovementRepository,
  private val userRepository: UserRepository,
  private val reconciler: AccountReconciler,
) {

  @Transactional
  fun sync(event: LocateChangedEvent) {
    val existing = repo.findByLocateId(event.locateId)
    if (event.deleted || event.cost.signum() == 0) {
      if (existing != null) {
        repo.delete(existing)
        reconciler.removed(existing)
      }
      return
    }
    val amount = event.cost.negate()
    if (existing != null) {
      val oldValueDate = existing.valueDate
      val oldAmount = existing.amount
      existing.amount = amount
      existing.valueDate = event.tradingDate
      existing.note = event.ticker
      existing.locateTicker = event.ticker
      existing.locateShares = event.shares
      existing.locateCandidateId = event.candidateId
      existing.updatedAt = Instant.now()
      repo.save(existing)
      reconciler.changed(existing, oldValueDate, oldAmount)
    } else {
      val created =
        repo.save(
          AccountMovement(
            user = userRepository.getReferenceById(event.userId),
            type = AccountMovementType.LOCATE,
            amount = amount,
            valueDate = event.tradingDate,
            note = event.ticker,
            locateId = event.locateId,
            locateTicker = event.ticker,
            locateShares = event.shares,
            locateCandidateId = event.candidateId,
          )
        )
      reconciler.added(created)
    }
  }
}
