package com.portfolioai.account.application

import com.portfolioai.account.application.dto.CorrectionRequest
import com.portfolioai.account.application.dto.ReconciliationDto
import com.portfolioai.account.application.dto.ReconciliationRequest
import com.portfolioai.account.application.dto.toDto
import com.portfolioai.account.domain.AccountReconciliation
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.account.infrastructure.persistence.AccountReconciliationRepository
import com.portfolioai.auth.application.AuthService
import java.time.Instant
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * The morning reconciliation (#198) — the one ritual of the day that touches the account : read the
 * balance TradeZero displays, compare it to the one the app derives, and settle the difference.
 *
 * Two outcomes, one call :
 * - **no gap** → the morning is simply timestamped. That row is the whole point of this service :
 *   before it, a clean morning left no trace, so "reconciled today ?" had no answer and the history
 *   had holes on exactly the good days.
 * - **a gap** → [AccountService.correctBalance] records the `ADJUSTMENT` that puts the balance on
 *   the broker's figure, and the reconciliation keeps its id.
 *
 * Reconciling the same morning twice overwrites the row (it is one decision) : the correction
 * closes the distance from the balance as it stands then, so a mistyped figure is fixed by a second
 * plug rather than a stacked line — but the remembered gap stays measured from the balance the
 * morning started at, which is what that day actually cost.
 *
 * [AccountService] is injected rather than re-implemented : the correction carries the re-floating
 * contract of `targetBalance` (see [AccountReconciler]), and duplicating that here would give the
 * balance two owners.
 */
@Service
class AccountReconciliationService(
  private val repo: AccountReconciliationRepository,
  private val movements: AccountMovementRepository,
  private val accountService: AccountService,
  private val authService: AuthService,
) {

  /** Settles [request]'s morning : timestamps it, and records a correction when the two differ. */
  @Transactional
  fun reconcile(request: ReconciliationRequest): ReconciliationDto {
    val user = authService.getCurrentUser()
    val existing = repo.findByUserIdAndValueDate(user.id, request.valueDate)
    val currentBalance = movements.balanceFor(user.id)

    // The correction closes the distance from where the balance **is** ; the gap the morning is
    // remembered by is measured from where it **started** — on a second pass, that starting point
    // is the one the first pass recorded, not the balance its own correction already moved.
    val startingBalance = existing?.appBalance ?: currentBalance
    val gap = request.brokerBalance.subtract(startingBalance)
    val correctionNeeded = request.brokerBalance.compareTo(currentBalance) != 0

    val correctionId =
      if (!correctionNeeded) existing?.correctionId
      else
        accountService
          .correctBalance(
            CorrectionRequest(targetBalance = request.brokerBalance, valueDate = request.valueDate)
          )
          .id

    val reconciliation =
      existing?.apply {
        brokerBalance = request.brokerBalance
        this.gap = gap
        // Kept, not overwritten with null : the correction this morning produced is still in the
        // ledger, and a history line claiming a clean morning would be a lie.
        this.correctionId = correctionId
        updatedAt = Instant.now()
      }
        ?: AccountReconciliation(
          user = user,
          valueDate = request.valueDate,
          brokerBalance = request.brokerBalance,
          appBalance = startingBalance,
          gap = gap,
          correctionId = correctionId,
        )
    return repo.save(reconciliation).toDto()
  }

  /**
   * The last [limit] mornings, latest first — the account page's history line and the Today page's
   * step 1 (which only reads the first row, to ask whether it is today's).
   */
  @Transactional(readOnly = true)
  fun history(limit: Int): List<ReconciliationDto> {
    val userId = authService.getCurrentUser().id
    return repo
      .findByUserIdOrderByValueDateDesc(userId, PageRequest.ofSize(limit.coerceIn(1, MAX_HISTORY)))
      .map { it.toDto() }
  }

  private companion object {
    /** The history is a one-line recap, not a listing — no need to page it. */
    const val MAX_HISTORY = 30
  }
}
