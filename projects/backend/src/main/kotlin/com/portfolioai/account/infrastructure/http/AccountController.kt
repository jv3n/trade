package com.portfolioai.account.infrastructure.http

import com.portfolioai.account.application.AccountReconciliationService
import com.portfolioai.account.application.AccountService
import com.portfolioai.account.application.dto.AccountMovementDto
import com.portfolioai.account.application.dto.AccountSummaryDto
import com.portfolioai.account.application.dto.BalancePointDto
import com.portfolioai.account.application.dto.CorrectionRequest
import com.portfolioai.account.application.dto.MovementRequest
import com.portfolioai.account.application.dto.ReconciliationDto
import com.portfolioai.account.application.dto.ReconciliationRequest
import com.portfolioai.account.domain.AccountMovementFilter
import com.portfolioai.account.domain.AccountMovementType
import io.swagger.v3.oas.annotations.tags.Tag
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.web.PageableDefault
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@Tag(
  name = "Account",
  description =
    "Broker cash account — manual movements (deposits / withdrawals / corrections) + derived " +
      "balance, scoped to the current user. TRADE movements are read-only (pushed from the journal).",
)
@RestController
@RequestMapping("/api/account")
class AccountController(
  private val service: AccountService,
  private val reconciliationService: AccountReconciliationService,
) {

  /**
   * Paginated movement history, newest-first (`value_date` desc, `created_at` desc). Each row
   * carries the balance it left behind, computed over the whole history — so narrowing to trades
   * does not renumber the column. A URL `sort` is ignored for that reason.
   *
   * dateFrom — `value_date >= dateFrom` (inclusive, yyyy-MM-dd) dateTo — `value_date <= dateTo`
   * (inclusive, yyyy-MM-dd) type — repeated, IN (...). Same vocabulary as the journal listing : the
   * front resolves its period presets to a date range and sends dates, never preset names.
   */
  @GetMapping("/movements")
  fun movements(
    @RequestParam(required = false)
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    dateFrom: LocalDate? = null,
    @RequestParam(required = false)
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    dateTo: LocalDate? = null,
    @RequestParam(required = false) type: List<AccountMovementType>? = null,
    @PageableDefault(size = 25) pageable: Pageable,
  ): Page<AccountMovementDto> =
    service.findAllPaged(AccountMovementFilter(dateFrom, dateTo, type), pageable)

  /**
   * Current balance (never windowed) plus the figures of the filtered period — trades P&L with its
   * count and winners, deposits / withdrawals and the net injected. Same filter params as
   * `/movements` so the KPI row and the table always describe the same window.
   */
  @GetMapping("/summary")
  fun summary(
    @RequestParam(required = false)
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    dateFrom: LocalDate? = null,
    @RequestParam(required = false)
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    dateTo: LocalDate? = null,
    @RequestParam(required = false) type: List<AccountMovementType>? = null,
  ): AccountSummaryDto = service.summary(AccountMovementFilter(dateFrom, dateTo, type))

  /** Cumulative end-of-day balance series (ascending) for the evolution chart. */
  @GetMapping("/balance-series")
  fun balanceSeries(): List<BalancePointDto> = service.balanceSeries()

  /** Adds a manual cash movement — DEPOSIT or WITHDRAWAL only (else 400). */
  @PostMapping("/movements")
  @ResponseStatus(HttpStatus.CREATED)
  fun add(@RequestBody request: MovementRequest): AccountMovementDto = service.addMovement(request)

  /** Records a balance correction : the real broker balance → an ADJUSTMENT of the signed delta. */
  @PostMapping("/corrections")
  @ResponseStatus(HttpStatus.CREATED)
  fun correct(@RequestBody request: CorrectionRequest): AccountMovementDto =
    service.correctBalance(request)

  /** Edits a manual movement (DEPOSIT / WITHDRAWAL / ADJUSTMENT). TRADE → 400, foreign id → 404. */
  @PutMapping("/movements/{id}")
  fun update(@PathVariable id: UUID, @RequestBody request: MovementRequest): AccountMovementDto =
    service.update(id, request)

  /** Deletes a manual movement. TRADE → 400 (managed from the journal), foreign id → 404. */
  @DeleteMapping("/movements/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun delete(@PathVariable id: UUID) = service.delete(id)

  // ---- Morning reconciliation (#198) ----------------------------------------------------------

  /**
   * Settles one morning against the balance TradeZero displays : timestamps it when the two agree,
   * records the ADJUSTMENT when they don't. Re-posting the same day overwrites that morning.
   */
  @PostMapping("/reconciliations")
  @ResponseStatus(HttpStatus.CREATED)
  fun reconcile(@RequestBody request: ReconciliationRequest): ReconciliationDto =
    reconciliationService.reconcile(request)

  /** The last mornings, latest first — the history line and the Today page's step 1. */
  @GetMapping("/reconciliations")
  fun reconciliations(@RequestParam(defaultValue = "10") limit: Int): List<ReconciliationDto> =
    reconciliationService.history(limit)

  /**
   * Cancels a morning — the reconciliation and the `ADJUSTMENT` it produced go together, and the
   * balance returns to where it stood before it. For a figure typed by mistake : re-posting the
   * same day corrects it, this erases it (#249).
   */
  @DeleteMapping("/reconciliations/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun cancelReconciliation(@PathVariable id: UUID) = reconciliationService.cancel(id)
}
