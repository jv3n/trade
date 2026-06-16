package com.portfolioai.account.application

import com.portfolioai.account.application.dto.AccountMovementDto
import com.portfolioai.account.application.dto.AccountSummaryDto
import com.portfolioai.account.application.dto.BalancePointDto
import com.portfolioai.account.application.dto.CorrectionRequest
import com.portfolioai.account.application.dto.MovementRequest
import com.portfolioai.account.application.dto.toDto
import com.portfolioai.account.domain.AccountMovement
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.auth.application.AuthService
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * Broker cash-account service. One implicit account per user (no `account` entity in v1) ; the
 * balance is **derived** as `Σ amount`, never stored. Every read/write is scoped to the current
 * user, and a missing-or-foreign id → 404 (never 403) so we don't leak existence — same contract as
 * the journal.
 *
 * Movement provenance :
 * - `DEPOSIT` / `WITHDRAWAL` — created + edited + deleted here (manual cash in / out).
 * - `ADJUSTMENT` — created via [correctBalance] (target → signed delta), editable + deletable.
 * - `TRADE` — pushed from the journal (journal-integration slice), **read-only** here : create /
 *   update / delete via the manual endpoints are rejected with 400.
 *
 * Validation is done in-service (à la `LexiconEntryService`) — non-positive / wrong-type / no-op
 * inputs return a clean 400 rather than reaching the DB CHECK constraints.
 */
@Service
class AccountService(
  private val repo: AccountMovementRepository,
  private val authService: AuthService,
) {

  @Transactional(readOnly = true)
  fun findAllPaged(pageable: Pageable): Page<AccountMovementDto> {
    val userId = authService.getCurrentUser().id
    val effective =
      if (pageable.sort.isUnsorted)
        PageRequest.of(pageable.pageNumber, pageable.pageSize, DEFAULT_SORT)
      else pageable
    return repo.findByUserId(userId, effective).map { it.toDto() }
  }

  /** Current balance + breakdown by movement type. */
  @Transactional(readOnly = true)
  fun summary(): AccountSummaryDto {
    val movements = repo.findByUserId(authService.getCurrentUser().id)
    fun sumOf(type: AccountMovementType): BigDecimal =
      movements.filter { it.type == type }.fold(BigDecimal.ZERO) { acc, m -> acc + m.amount }
    val deposits = sumOf(AccountMovementType.DEPOSIT)
    val withdrawals = sumOf(AccountMovementType.WITHDRAWAL)
    val trades = sumOf(AccountMovementType.TRADE)
    val adjustments = sumOf(AccountMovementType.ADJUSTMENT)
    return AccountSummaryDto(
      balance = deposits + withdrawals + trades + adjustments,
      totalDeposits = deposits,
      totalWithdrawals = withdrawals,
      netInjected = deposits + withdrawals,
      tradesPnl = trades,
      adjustments = adjustments,
      movementCount = movements.size.toLong(),
    )
  }

  /**
   * Cumulative balance series — one end-of-day point per distinct movement date, ascending. The
   * running sum is taken over every movement (deposits / withdrawals / trades / adjustments)
   * ordered by `valueDate` then `createdAt`. Pure function of the data : period windowing + the
   * change KPI are computed client-side, so this stays date-independent and trivially testable.
   */
  @Transactional(readOnly = true)
  fun balanceSeries(): List<BalancePointDto> {
    val userId = authService.getCurrentUser().id
    val movements =
      repo.findByUserId(userId).sortedWith(compareBy({ it.valueDate }, { it.createdAt }))
    var running = BigDecimal.ZERO
    val byDate = LinkedHashMap<LocalDate, BigDecimal>()
    for (m in movements) {
      running += m.amount
      byDate[m.valueDate] = running // last write per date = end-of-day cumulative
    }
    return byDate.map { (date, balance) -> BalancePointDto(date, balance) }
  }

  /** Adds a manual cash movement. DEPOSIT / WITHDRAWAL only — everything else is a 400. */
  @Transactional
  fun addMovement(request: MovementRequest): AccountMovementDto {
    if (
      request.type != AccountMovementType.DEPOSIT && request.type != AccountMovementType.WITHDRAWAL
    ) {
      throw badRequest(
        "Only DEPOSIT or WITHDRAWAL can be added here — TRADE comes from the journal, ADJUSTMENT from the correction endpoint"
      )
    }
    val movement =
      AccountMovement(
        user = authService.getCurrentUser(),
        type = request.type,
        amount = signedAmount(request.type, request.amount),
        valueDate = request.valueDate,
        note = request.note.cleanNote(),
      )
    return repo.save(movement).toDto()
  }

  /**
   * Records a balance correction : the real broker balance → an `ADJUSTMENT` of `target − current`.
   * A zero delta (the derived balance already matches) is a 400 — nothing meaningful to record.
   */
  @Transactional
  fun correctBalance(request: CorrectionRequest): AccountMovementDto {
    val user = authService.getCurrentUser()
    val delta = request.targetBalance.subtract(repo.balanceFor(user.id))
    if (delta.signum() == 0) {
      throw badRequest("Balance already matches the target — no correction recorded")
    }
    val movement =
      AccountMovement(
        user = user,
        type = AccountMovementType.ADJUSTMENT,
        amount = delta,
        valueDate = request.valueDate,
        note = request.note.cleanNote(),
      )
    return repo.save(movement).toDto()
  }

  /** Edits a manual movement. TRADE → 400 ; type change → 400 ; foreign / missing id → 404. */
  @Transactional
  fun update(id: UUID, request: MovementRequest): AccountMovementDto {
    val movement = loadOwned(id)
    if (movement.type == AccountMovementType.TRADE) {
      throw badRequest("TRADE movements are managed from the journal and can't be edited here")
    }
    if (request.type != movement.type) {
      throw badRequest("A movement's type can't be changed — delete it and create a new one")
    }
    movement.amount = signedAmount(movement.type, request.amount)
    movement.valueDate = request.valueDate
    movement.note = request.note.cleanNote()
    movement.updatedAt = Instant.now()
    return repo.save(movement).toDto()
  }

  /**
   * Deletes a manual movement. TRADE → 400 (managed from the journal) ; foreign / missing → 404.
   */
  @Transactional
  fun delete(id: UUID) {
    val movement = loadOwned(id)
    if (movement.type == AccountMovementType.TRADE) {
      throw badRequest("TRADE movements are removed by deleting their trade in the journal")
    }
    repo.delete(movement)
  }

  private fun loadOwned(id: UUID): AccountMovement {
    val userId = authService.getCurrentUser().id
    return repo.findByIdAndUserId(id, userId)
      ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Account movement $id not found")
  }

  /**
   * Applies the sign convention from the type : DEPOSIT + and WITHDRAWAL − (both from a positive
   * magnitude), ADJUSTMENT signed as-is. TRADE can't be created manually.
   */
  private fun signedAmount(type: AccountMovementType, amount: BigDecimal): BigDecimal =
    when (type) {
      AccountMovementType.DEPOSIT -> amount.requirePositive()
      AccountMovementType.WITHDRAWAL -> amount.requirePositive().negate()
      AccountMovementType.ADJUSTMENT ->
        amount.also { if (it.signum() == 0) throw badRequest("Adjustment amount must not be zero") }
      AccountMovementType.TRADE -> throw badRequest("TRADE movements can't be created manually")
    }

  private fun BigDecimal.requirePositive(): BigDecimal = also {
    if (it.signum() <= 0) throw badRequest("Amount must be greater than zero")
  }

  private fun String?.cleanNote(): String? = this?.trim()?.ifEmpty { null }

  private fun badRequest(message: String) = ResponseStatusException(HttpStatus.BAD_REQUEST, message)

  private companion object {
    /** Newest-first, `createdAt` tiebreaker — implicit listing sort when the URL has no `sort`. */
    val DEFAULT_SORT: Sort = Sort.by(Sort.Order.desc("valueDate"), Sort.Order.desc("createdAt"))
  }
}
