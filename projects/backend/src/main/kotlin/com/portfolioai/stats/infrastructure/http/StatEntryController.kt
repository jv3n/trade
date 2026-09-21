package com.portfolioai.stats.infrastructure.http

import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.StatCompletionRequest
import com.portfolioai.stats.application.dto.StatEntryDto
import com.portfolioai.stats.application.dto.StatEntryRequest
import com.portfolioai.stats.application.dto.StatSummaryDto
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.domain.StatStatus
import io.swagger.v3.oas.annotations.tags.Tag
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.web.PageableDefault
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
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
  name = "Stats",
  description =
    "The stats sheet : premarket data copied from the candidate, completed with the session prices " +
      "after the 4 pm close. Scoped to the current user. A stat is created by promoting a candidate " +
      "(see Candidates) — there is no create endpoint here ; the CSV leg is export only.",
)
@RestController
@RequestMapping("/api/stats")
class StatEntryController(private val service: StatEntryService) {

  /**
   * Filtered + paginated listing, scoped to the caller. Every filter param is optional. Standard
   * Spring `Pageable` — `?page=0&size=50&sort=tradeDate,desc`. Default 50 rows, sorted `tradeDate
   * desc, createdAt desc` (fallback owned by the service so a URL `sort` is honoured).
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
    @RequestParam(required = false) pattern: Pattern? = null,
    @RequestParam(required = false) status: StatStatus? = null,
    @PageableDefault(size = 50) pageable: Pageable,
  ): Page<StatEntryDto> =
    service.findAllPaged(filterOf(q, dateFrom, dateTo, pattern, status), pageable)

  /**
   * KPIs over the same filter as the listing, computed on the whole filtered set (not the page).
   */
  @GetMapping("/summary")
  fun summary(
    @RequestParam(required = false) q: String? = null,
    @RequestParam(required = false)
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    dateFrom: LocalDate? = null,
    @RequestParam(required = false)
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    dateTo: LocalDate? = null,
    @RequestParam(required = false) pattern: Pattern? = null,
    @RequestParam(required = false) status: StatStatus? = null,
  ): StatSummaryDto = service.summarise(filterOf(q, dateFrom, dateTo, pattern, status))

  /** Fetch a single stat by id (404 if foreign / missing). */
  @GetMapping("/{id}") fun get(@PathVariable id: UUID): StatEntryDto = service.findById(id)

  /**
   * Overwrites a stat — the session panel sends the whole row back each time a field is left.
   * Foreign id → 404 ; (day, ticker) already taken → 409 ; clearing a price of a completed stat
   * → 400.
   */
  @PutMapping("/{id}")
  fun update(@PathVariable id: UUID, @RequestBody request: StatEntryRequest): StatEntryDto =
    service.update(id, request)

  /**
   * Ticks the stat as completed (`{"completed": true}`) or back to "to complete" — the ✓ of the
   * sheet. Ticking without the five session prices → 400 ; foreign id → 404.
   */
  @PutMapping("/{id}/completion")
  fun setCompletion(
    @PathVariable id: UUID,
    @RequestBody request: StatCompletionRequest,
  ): StatEntryDto = service.setCompleted(id, request.completed)

  /** Deletes one of the caller's stats. Foreign id → 404. */
  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun delete(@PathVariable id: UUID) = service.delete(id)

  /**
   * « → Trade » (#193) — creates the journal trade this stat gave birth to and returns it, so the
   * client can navigate straight to its page. The trade inherits the stat's date, ticker and
   * pattern ; everything else is typed on the trade page. A stat that already has a trade is a 409.
   *
   * This is the **only** way a trade is created : the journal has no create endpoint.
   */
  @PostMapping("/{id}/trade")
  @ResponseStatus(HttpStatus.CREATED)
  fun promoteToTrade(@PathVariable id: UUID): TradeEntryDto = service.promoteToTrade(id)

  /**
   * CSV export of the caller's stats — a spreadsheet-friendly copy, no import counterpart.
   * `text/csv` attachment.
   */
  @GetMapping("/export", produces = ["text/csv"])
  fun exportCsv(): ResponseEntity<ByteArray> {
    val csv = service.exportAllAsCsv().toByteArray(Charsets.UTF_8)
    val filename = "stats-export-${LocalDate.now()}.csv"
    return ResponseEntity.ok()
      .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
      .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
      .body(csv)
  }

  private fun filterOf(
    q: String?,
    dateFrom: LocalDate?,
    dateTo: LocalDate?,
    pattern: Pattern?,
    status: StatStatus?,
  ) =
    StatEntryFilter(
      query = q,
      dateFrom = dateFrom,
      dateTo = dateTo,
      pattern = pattern,
      status = status,
    )
}
