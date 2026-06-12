package com.portfolioai.stats.infrastructure.http

import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.ImportResult
import com.portfolioai.stats.application.dto.StatEntryDto
import com.portfolioai.stats.application.dto.StatEntryFormRequest
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.domain.StatSource
import io.swagger.v3.oas.annotations.tags.Tag
import java.math.BigDecimal
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
import org.springframework.web.multipart.MultipartFile

@Tag(
  name = "Stats",
  description =
    "Trade-stats `stat_entry` dataset : ADMIN CSV import (community rows), open CSV export, and " +
      "per-user CRUD (radar / manual analyses). Reads + edits are scoped to global + own rows.",
)
@RestController
@RequestMapping("/api/stats")
class StatEntryController(private val service: StatEntryService) {

  /**
   * Filtered + paginated listing, scoped to what the current user may see (global community rows +
   * their own radar/manual analyses). Every filter param is optional. Standard Spring `Pageable` —
   * `?page=0&size=50&sort=pushPercent,desc`. Default 50 rows, sorted `tradeDate desc, createdAt
   * desc` (fallback owned by the service so a URL `sort` is honoured). Response is Spring's
   * `Page<T>`.
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
    @RequestParam(required = false) source: StatSource? = null,
    @RequestParam(required = false) gapMin: BigDecimal? = null,
    @RequestParam(required = false) gapMax: BigDecimal? = null,
    @PageableDefault(size = 50) pageable: Pageable,
  ): Page<StatEntryDto> =
    service.findAllPaged(
      StatEntryFilter(
        query = q,
        dateFrom = dateFrom,
        dateTo = dateTo,
        source = source,
        gapMin = gapMin,
        gapMax = gapMax,
      ),
      pageable,
    )

  /**
   * Creates a user-owned stat — the radar « Add stat » (`source = RADAR`) or the manual dialog
   * (`source = MANUAL`, default). Open to any authenticated user ; the row is owned by and visible
   * only to its creator. Upserts on (day, ticker, caller).
   */
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  fun create(@RequestBody request: StatEntryFormRequest): StatEntryDto = service.create(request)

  /**
   * Edits one of the caller's own rows. Not-owned (incl. IMPORT) → 404 ; unique collision → 409.
   */
  @PutMapping("/{id}")
  fun update(@PathVariable id: UUID, @RequestBody request: StatEntryFormRequest): StatEntryDto =
    service.update(id, request)

  /** Deletes one of the caller's own rows. Not-owned (incl. IMPORT) → 404. */
  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun delete(@PathVariable id: UUID) = service.delete(id)

  /**
   * CSV export of the community (global) stat rows. Readable by any authenticated user.
   * Roundtrip-safe with the import (`StatEntryCsvEncoder` re-emits the import layout). `text/csv`
   * attachment.
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

  /**
   * CSV import — `multipart/form-data` with a `file` part. Atomic batch ; each row upserts the
   * global community slot. ADMIN-only (gated in `SecurityConfig`). Always 200 with an
   * [ImportResult] ; per-row errors are in the body, not a 4xx.
   */
  @PostMapping("/import", consumes = ["multipart/form-data"])
  fun importCsv(@RequestParam("file") file: MultipartFile): ImportResult {
    val csv = String(file.bytes, Charsets.UTF_8)
    return service.importCsv(csv)
  }
}
