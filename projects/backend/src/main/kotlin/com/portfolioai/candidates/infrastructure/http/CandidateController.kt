package com.portfolioai.candidates.infrastructure.http

import com.portfolioai.candidates.application.CandidateService
import com.portfolioai.candidates.application.dto.BulkPromotionDto
import com.portfolioai.candidates.application.dto.CandidateDto
import com.portfolioai.candidates.application.dto.CandidateRequest
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.application.dto.StatEntryDto
import io.swagger.v3.oas.annotations.tags.Tag
import java.time.LocalDate
import java.util.UUID
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
  name = "Candidates",
  description =
    "Morning capture of the tickers spotted on the radar — premarket prices, float, volume, locate " +
      "and a note, scoped to the current user. Browsed day by day ; one candidate per day and ticker.",
)
@RestController
@RequestMapping("/api/candidates")
class CandidateController(private val service: CandidateService) {

  /** A day's candidates — defaults to today when `date` is omitted. */
  @GetMapping
  fun list(
    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate?
  ): List<CandidateDto> = service.listForDate(date)

  /** Fetch a single candidate by id (404 if foreign / missing). */
  @GetMapping("/{id}") fun get(@PathVariable id: UUID): CandidateDto = service.findById(id)

  /** Captures a new candidate. Same day + ticker already captured → 409. */
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  fun create(@RequestBody request: CandidateRequest): CandidateDto = service.create(request)

  /** Updates a candidate. Foreign id → 404 ; renaming onto a captured ticker → 409. */
  @PutMapping("/{id}")
  fun update(@PathVariable id: UUID, @RequestBody request: CandidateRequest): CandidateDto =
    service.update(id, request)

  /**
   * Copies a candidate onto the stats sheet as a `pattern` stat (GUS or DT, GUS by default) — the «
   * → GUS » / « → DT » actions. Returns the new stat, which starts "to complete". Foreign id → 404
   * ; a stat of that pattern already there → 409 ; another pattern → 400.
   */
  @PostMapping("/{id}/promote")
  @ResponseStatus(HttpStatus.CREATED)
  fun promote(
    @PathVariable id: UUID,
    @RequestParam(defaultValue = "GUS") pattern: Pattern,
  ): StatEntryDto = service.promote(id, pattern)

  /**
   * Makes a GUS stat of every candidate of a day that has none yet — « Tout passer en GUS ».
   * Idempotent : the tickers it left alone come back in `skipped`. Defaults to today.
   */
  @PostMapping("/promote")
  fun promoteDay(
    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate?
  ): BulkPromotionDto = service.promoteDay(date)

  /** Removes a candidate. Foreign id → 404. */
  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun delete(@PathVariable id: UUID) = service.delete(id)
}
