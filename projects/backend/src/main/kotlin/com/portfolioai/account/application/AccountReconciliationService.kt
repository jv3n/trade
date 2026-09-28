package com.portfolioai.account.application

import com.portfolioai.account.application.dto.ReconciliationDto
import com.portfolioai.account.application.dto.ReconciliationRequest
import com.portfolioai.account.application.dto.toDto
import com.portfolioai.account.domain.AccountReconciliation
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.account.infrastructure.persistence.AccountReconciliationRepository
import com.portfolioai.auth.application.AuthService
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * The morning reconciliation (#198) — the one ritual of the day that touches the account : read the
 * balance TradeZero displays, compare it to the one the app derives, and settle the difference.
 *
 * Two outcomes, one call :
 * - **no gap** → the morning is simply timestamped. That row is the whole point of this service :
 *   before it, a clean morning left no trace, so "reconciled today ?" had no answer and the history
 *   had holes on exactly the good days.
 * - **a gap** → the morning's `ADJUSTMENT` puts the balance on the broker's figure, and the
 *   reconciliation keeps its id.
 *
 * Reconciling the same morning twice overwrites the row (it is one decision) : the gap is measured
 * again from the app's balance without that morning's own correction, and the correction is set to
 * it — so a mistyped figure leaves one line, not two, and a typo's gap does not stack on the real
 * one. Correction and gap are equal when a pass settles ; only a later absorption (#476) moves the
 * correction away from the gap.
 *
 * The correction is written by [AccountReconciler], the one owner of the rule that keeps every
 * reconciled morning true when an earlier movement changes (#476).
 */
@Service
class AccountReconciliationService(
  private val repo: AccountReconciliationRepository,
  private val movements: AccountMovementRepository,
  private val accountService: AccountService,
  private val reconciler: AccountReconciler,
  private val authService: AuthService,
) {

  /** Settles [request]'s morning : timestamps it, and records a correction when the two differ. */
  @Transactional
  fun reconcile(request: ReconciliationRequest): ReconciliationDto {
    // The broker never shows a negative balance (#307) — the UI blocks it, the API says no too.
    if (request.brokerBalance.signum() < 0) {
      throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Broker balance must not be negative")
    }
    val user = authService.getCurrentUser()
    // A later morning already counted everything before it : settling an earlier one now would
    // move the balance under that later morning without it absorbing the change (#476).
    if (
      repo.findFirstByUserIdAndValueDateGreaterThanOrderByValueDateAsc(
        user.id,
        request.valueDate,
      ) != null
    ) {
      throw ResponseStatusException(
        HttpStatus.BAD_REQUEST,
        "A later morning is already reconciled — mornings are settled in order",
      )
    }
    val existing = repo.findByUserIdAndValueDate(user.id, request.valueDate)

    // The app's balance without this morning's own correction : on a second pass, the first one's
    // plug is taken back out, and a row typed for that day in between is counted — measuring from
    // the first pass's figure would book that row as broker fees (#480).
    val ownCorrection = existing?.let { reconciler.correctionAmount(it) } ?: BigDecimal.ZERO
    val startingBalance = movements.balanceFor(user.id).subtract(ownCorrection)
    val gap = request.brokerBalance.subtract(startingBalance)

    val reconciliation =
      existing?.apply {
        brokerBalance = request.brokerBalance
        appBalance = startingBalance
        this.gap = gap
        updatedAt = Instant.now()
      }
        ?: AccountReconciliation(
          user = user,
          valueDate = request.valueDate,
          brokerBalance = request.brokerBalance,
          appBalance = startingBalance,
          gap = gap,
        )
    val saved = repo.save(reconciliation)
    reconciler.settle(saved, gap)
    return saved.toDto()
  }

  /**
   * Cancels a morning : the reconciliation row **and** the `ADJUSTMENT` it produced go together,
   * and the balance goes back where it stood before it (#249).
   *
   * `V18` made the FK `ON DELETE SET NULL` so a correction removed on its own leaves the morning in
   * the history — *"it happened, and the history says so"*. That reasoning holds for a morning that
   * really was reconciled ; it does not for a mistyped figure, where the point is that the morning
   * never happened as recorded. Hence a cancellation that removes both, rather than one that breaks
   * the link between them.
   *
   * The correction goes through [AccountService.delete] rather than the repository, so its removal
   * is absorbed like any other : by the next reconciled morning if there is one, by the balance
   * otherwise.
   */
  @Transactional
  fun cancel(id: UUID) {
    val user = authService.getCurrentUser()
    val reconciliation =
      repo.findByIdAndUserId(id, user.id)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Reconciliation not found")
    // Deleted first : the FK would null the link out from under us on the movement delete.
    val correctionId = reconciliation.correctionId
    repo.delete(reconciliation)
    repo.flush()
    correctionId?.let { accountService.delete(it) }
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
