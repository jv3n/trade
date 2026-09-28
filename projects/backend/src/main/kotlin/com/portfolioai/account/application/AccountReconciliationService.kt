package com.portfolioai.account.application

import com.portfolioai.account.application.dto.ReconciliationDto
import com.portfolioai.account.application.dto.ReconciliationRequest
import com.portfolioai.account.application.dto.toDto
import com.portfolioai.account.domain.AccountReconciliation
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.account.infrastructure.persistence.AccountReconciliationRepository
import com.portfolioai.auth.application.AuthService
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
 * Reconciling the same morning twice overwrites the row (it is one decision) : the morning's own
 * correction moves to close the distance from the balance as it stands then, so a mistyped figure
 * leaves one line, not two — but the remembered gap stays measured from the balance the morning
 * started at, which is what that day actually cost.
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
    val currentBalance = movements.balanceFor(user.id)

    // The correction closes the distance from where the balance **is** ; the gap the morning is
    // remembered by is measured from where it **started** — on a second pass, that starting point
    // is the one the first pass recorded, not the balance its own correction already moved.
    val startingBalance = existing?.appBalance ?: currentBalance
    val gap = request.brokerBalance.subtract(startingBalance)

    val reconciliation =
      existing?.apply {
        brokerBalance = request.brokerBalance
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
    val ownCorrection = reconciler.correctionAmount(saved)
    reconciler.settle(saved, ownCorrection + request.brokerBalance.subtract(currentBalance))
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
