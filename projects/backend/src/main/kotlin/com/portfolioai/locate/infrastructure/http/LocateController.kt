package com.portfolioai.locate.infrastructure.http

import com.portfolioai.locate.application.LocateService
import com.portfolioai.locate.application.dto.LocateDto
import com.portfolioai.locate.application.dto.LocateRequest
import com.portfolioai.locate.application.dto.LocateUpdateRequest
import com.portfolioai.shared.badRequest
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
  name = "Locates",
  description =
    "Shares located before a short — paid whether or not the trade happens, on a candidate or alone.",
)
@RestController
@RequestMapping("/api/locates")
class LocateController(private val service: LocateService) {

  /** `?candidateId=` for one candidate's locates, else `?date=` (and `&ticker=`) for a day's. */
  @GetMapping
  fun list(
    @RequestParam(required = false) candidateId: UUID?,
    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate?,
    @RequestParam(required = false) ticker: String?,
  ): List<LocateDto> =
    when {
      candidateId != null -> service.listForCandidate(candidateId)
      date != null -> service.listForDate(date, ticker)
      else -> throw badRequest("A date or a candidate is required")
    }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  fun create(@RequestBody request: LocateRequest): LocateDto = service.create(request)

  @PutMapping("/{id}")
  fun update(@PathVariable id: UUID, @RequestBody request: LocateUpdateRequest): LocateDto =
    service.update(id, request)

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun delete(@PathVariable id: UUID) = service.delete(id)
}
