package com.portfolioai.account.infrastructure.http

import com.portfolioai.account.application.AccountService
import com.portfolioai.account.application.dto.AccountMovementDto
import com.portfolioai.account.application.dto.AccountSummaryDto
import com.portfolioai.account.application.dto.CorrectionRequest
import com.portfolioai.account.application.dto.MovementRequest
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.web.PageableDefault
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
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
class AccountController(private val service: AccountService) {

  /**
   * Paginated movement history, newest-first (`value_date` desc, `created_at` desc — fallback owned
   * by the service so a URL `sort` is honoured). Standard Spring `Pageable` ; default 25 rows.
   */
  @GetMapping("/movements")
  fun movements(@PageableDefault(size = 25) pageable: Pageable): Page<AccountMovementDto> =
    service.findAllPaged(pageable)

  /**
   * Current balance + breakdown (deposits / withdrawals / net injected / trades P&L / adjustments).
   */
  @GetMapping("/summary") fun summary(): AccountSummaryDto = service.summary()

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
}
