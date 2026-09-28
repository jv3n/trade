package com.portfolioai.account.application

import com.portfolioai.account.domain.AccountMovement
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.domain.AccountReconciliation
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.account.infrastructure.persistence.AccountReconciliationRepository
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Keeps every reconciled morning true (#476). On morning D the broker showed a balance that
 * included every movement dated before D ; a later change to one of those movements does not move
 * the broker's figure, so it must not move the account's either.
 *
 * A change of δ to a movement dated d is therefore absorbed by **the first reconciled morning
 * strictly after d**, whose correction moves by −δ. With no such morning, nothing absorbs it and
 * the balance moves by δ. Once that first morning has absorbed it, the balance at every later
 * morning is unchanged, so their corrections have nothing to do.
 *
 * - Adding, editing and deleting are the same operation, so deleting a row and re-creating it
 *   leaves every figure where it was.
 * - A movement dated on the morning's own day is not absorbed by it : a trade of day D happens
 *   after that morning. Known limit : a morning settled late in the day already counted that day's
 *   rows, and a later edit to one of them moves the balance rather than that morning's correction.
 * - The anchor is the morning, not its correction : a clean morning gains a correction when it
 *   absorbs a change, and a correction absorbed down to zero is removed while its morning stays.
 * - A correction without a morning (a legacy row) never absorbs.
 * - The two moves that would make a morning lie are refused upstream : editing its correction
 *   directly, and settling a morning earlier than one already recorded.
 *
 * A separate `@Transactional` bean so `AccountService`, `AccountTradeSyncService` and
 * `AccountReconciliationService` share it through Spring's proxy, inside their own transaction.
 */
@Service
class AccountReconciler(
  private val movements: AccountMovementRepository,
  private val reconciliations: AccountReconciliationRepository,
) {

  @Transactional
  fun added(movement: AccountMovement) {
    absorb(movement.user.id, listOf(movement.valueDate to movement.amount))
  }

  @Transactional
  fun removed(movement: AccountMovement) {
    absorb(movement.user.id, listOf(movement.valueDate to movement.amount.negate()))
  }

  /** [movement] already carries its new date and amount ; a date change can move two mornings. */
  @Transactional
  fun changed(movement: AccountMovement, oldValueDate: LocalDate, oldAmount: BigDecimal) {
    absorb(
      movement.user.id,
      listOf(oldValueDate to oldAmount.negate(), movement.valueDate to movement.amount),
    )
  }

  /**
   * Sets [morning]'s correction to [amount] : created, updated in place, or removed at zero — the
   * `amount <> 0` CHECK forbids a zero row. [morning] must already be persisted.
   */
  @Transactional
  fun settle(morning: AccountReconciliation, amount: BigDecimal) {
    val correction = correctionOf(morning)
    when {
      amount.signum() == 0 ->
        correction?.let {
          // Unlinked before the delete, or the next flush writes the dangling id back.
          morning.correctionId = null
          reconciliations.save(morning)
          movements.delete(it)
        }
      correction != null -> {
        if (correction.amount.compareTo(amount) == 0) return
        correction.amount = amount
        correction.updatedAt = Instant.now()
        movements.save(correction)
      }
      else -> {
        val created =
          movements.save(
            AccountMovement(
              user = morning.user,
              type = AccountMovementType.ADJUSTMENT,
              amount = amount,
              valueDate = morning.valueDate,
            )
          )
        morning.correctionId = created.id
        reconciliations.save(morning)
      }
    }
  }

  /** The morning's correction, 0 on a clean morning. */
  fun correctionAmount(morning: AccountReconciliation): BigDecimal =
    correctionOf(morning)?.amount ?: BigDecimal.ZERO

  /** The two sides of an edit can land on the same morning : they are netted before settling. */
  private fun absorb(userId: UUID, changes: List<Pair<LocalDate, BigDecimal>>) {
    val byMorning = LinkedHashMap<UUID, Pair<AccountReconciliation, BigDecimal>>()
    for ((valueDate, delta) in changes) {
      if (delta.signum() == 0) continue
      val morning =
        reconciliations.findFirstByUserIdAndValueDateGreaterThanOrderByValueDateAsc(
          userId,
          valueDate,
        ) ?: continue
      val netted = (byMorning[morning.id]?.second ?: BigDecimal.ZERO) + delta
      byMorning[morning.id] = morning to netted
    }
    for ((morning, delta) in byMorning.values) {
      if (delta.signum() != 0) settle(morning, correctionAmount(morning) - delta)
    }
  }

  private fun correctionOf(morning: AccountReconciliation): AccountMovement? =
    morning.correctionId?.let { movements.findById(it).orElse(null) }
}
