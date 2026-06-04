package com.portfolioai.journal.infrastructure.http

import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.journal.domain.TradeEntryFilter
import com.portfolioai.journal.domain.TradePattern
import com.portfolioai.journal.domain.TradePlay
import com.portfolioai.journal.domain.TradeStatus
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
  name = "Journal",
  description = "Trading journal — CRUD over `trade_entry`, scoped to the current user",
)
@RestController
@RequestMapping("/api/journal/trades")
class TradeEntryController(private val service: TradeEntryService) {

  /**
   * Filtered listing. Every query parameter is optional ; absence means "no filter on that axis".
   * Multi-value params (`play`, `pattern`) accept the repeated `?play=A&play=B` form.
   *
   * q — ticker LIKE %q% (case-insensitive) dateFrom — `trade_date >= dateFrom` (inclusive,
   * yyyy-MM-dd) dateTo — `trade_date <= dateTo` (inclusive, yyyy-MM-dd) play — repeated, IN (...)
   * pattern — repeated, IN (...) status — one of OPEN / CLOSED / PROFITABLE / LOSING (derived
   * predicate)
   */
  @GetMapping
  fun findAll(
    @RequestParam(required = false) q: String? = null,
    @RequestParam(required = false)
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    dateFrom: LocalDate? = null,
    @RequestParam(required = false)
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    dateTo: LocalDate? = null,
    @RequestParam(required = false) play: List<TradePlay>? = null,
    @RequestParam(required = false) pattern: List<TradePattern>? = null,
    @RequestParam(required = false) status: TradeStatus? = null,
  ): List<TradeEntryDto> =
    service.findAll(
      TradeEntryFilter(
        query = q,
        dateFrom = dateFrom,
        dateTo = dateTo,
        plays = play,
        patterns = pattern,
        status = status,
      )
    )

  @GetMapping("/{id}") fun findById(@PathVariable id: UUID): TradeEntryDto = service.findById(id)

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  fun create(@RequestBody request: TradeEntryRequest): TradeEntryDto = service.create(request)

  @PutMapping("/{id}")
  fun update(@PathVariable id: UUID, @RequestBody request: TradeEntryRequest): TradeEntryDto =
    service.update(id, request)

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun delete(@PathVariable id: UUID) = service.delete(id)
}
