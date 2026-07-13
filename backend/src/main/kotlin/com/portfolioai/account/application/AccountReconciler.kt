package com.portfolioai.account.application

import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.Pageable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Re-floats a user's latest balance correction so the derived balance keeps matching the reconciled
 * target after another line is **edited or deleted**. Without this, a correction's delta was frozen
 * at creation : fixing an erroneous deposit / withdrawal (or re-syncing a trade's P&L) later moved
 * the balance while the adjustment stayed put, so the total drifted away from the target the user
 * reconciled to.
 *
 * The anchor is the most recent `ADJUSTMENT` carrying a `targetBalance` (see
 * [AccountMovementRepository.findLatestCorrection]). Only that one floats — older corrections were
 * real reconciliations at their own date and stay frozen, as do legacy adjustments (null target).
 *
 * Recompute : `newDelta = target − (balance − anchor.amount)` where `balance − anchor.amount` is
 * the sum of every *other* movement. If the target is now reached without any plug (`newDelta ==
 * 0`) the anchor is deleted rather than left as a zero row (which the `account_movement` CHECK
 * forbids). If that deletion uncovers an older correction, the older one stays frozen — the balance
 * already sits on the anchor's target, so nothing more is owed.
 *
 * Deliberately **not** triggered on *adding* a new deposit / withdrawal / trade : fresh cash or a
 * new trade's P&L is a real balance move, not a mistake to absorb. Only edits and deletes re-float.
 *
 * A separate `@Transactional` bean (not a method on `AccountService` / `AccountTradeSyncService`)
 * so both callers share it through Spring's proxy — a self-invocation would bypass AOP (cf.
 * CLAUDE.md), and it joins the caller's transaction so the recompute commits or rolls back with the
 * mutation.
 */
@Service
class AccountReconciler(private val repo: AccountMovementRepository) {

  @Transactional
  fun reconcile(userId: UUID) {
    val anchor = repo.findLatestCorrection(userId, Pageable.ofSize(1)).firstOrNull() ?: return
    val target = anchor.targetBalance ?: return
    // `balanceFor` auto-flushes the caller's pending edit / delete first, so this is the
    // post-mutation
    // sum ; subtracting the anchor's own current amount leaves the sum of every other movement.
    val othersSum = repo.balanceFor(userId).subtract(anchor.amount)
    val newDelta = target.subtract(othersSum)
    when {
      newDelta.signum() == 0 -> repo.delete(anchor)
      newDelta.compareTo(anchor.amount) != 0 -> {
        anchor.amount = newDelta
        anchor.updatedAt = Instant.now()
        repo.save(anchor)
      }
    }
  }
}
