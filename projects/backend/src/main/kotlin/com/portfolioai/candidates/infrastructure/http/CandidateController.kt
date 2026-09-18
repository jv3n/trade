package com.portfolioai.candidates.infrastructure.http

import com.portfolioai.candidates.application.CandidateService
import com.portfolioai.candidates.application.dto.CandidateDto
import com.portfolioai.candidates.application.dto.CandidateRequest
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
    "Short-trade preparation cockpit — risk-based entry ladder, execution tracking and cover ladder " +
      "per ticker, scoped to the current user. Date-driven : the dropdown lists a single session's " +
      "candidates ; older ones stay in the DB but off the picker.",
)
@RestController
@RequestMapping("/api/candidates")
class CandidateController(private val service: CandidateService) {

  /** The day's candidates for the dropdown — defaults to today when `date` is omitted. */
  @GetMapping
  fun list(
    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate?
  ): List<CandidateDto> = service.listForDate(date)

  /** Fetch a single candidate by id (404 if foreign / missing). */
  @GetMapping("/{id}") fun get(@PathVariable id: UUID): CandidateDto = service.findById(id)

  /** Saves a new candidate. */
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  fun create(@RequestBody request: CandidateRequest): CandidateDto = service.create(request)

  /** Re-saves (upserts) an existing candidate. Foreign id → 404. */
  @PutMapping("/{id}")
  fun update(@PathVariable id: UUID, @RequestBody request: CandidateRequest): CandidateDto =
    service.update(id, request)

  /** Removes a candidate. Foreign id → 404. */
  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun delete(@PathVariable id: UUID) = service.delete(id)
}
