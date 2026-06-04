package com.portfolioai.journal.infrastructure.http

import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.journal.application.dto.ImportResult
import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.journal.domain.TradeEntryFilter
import com.portfolioai.journal.domain.TradePattern
import com.portfolioai.journal.domain.TradePlay
import com.portfolioai.journal.domain.TradeStatus
import io.swagger.v3.oas.annotations.tags.Tag
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
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
  name = "Journal",
  description = "Trading journal — CRUD over `trade_entry`, scoped to the current user",
)
@RestController
@RequestMapping("/api/journal/trades")
class TradeEntryController(private val service: TradeEntryService) {

  /**
   * Filtered + paginated listing. Every filter parameter is optional ; absence means "no filter on
   * that axis". Multi-value params (`play`, `pattern`) accept the repeated `?play=A&play=B` form.
   *
   * Pagination is standard Spring `Pageable` — clients pass `?page=0&size=50&sort=tradeDate,desc`.
   * Default : 50 rows per page, sorted by `tradeDate` desc then `createdAt` desc (which puts the
   * latest trades on page 0). The response body is Spring's `Page<T>` shape : `{ content: [...],
   * totalElements: N, totalPages: M, number: page, size: pageSize, ... }`.
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
    @PageableDefault(size = 50, sort = ["tradeDate", "createdAt"], direction = Sort.Direction.DESC)
    pageable: Pageable,
  ): Page<TradeEntryDto> =
    service.findAllPaged(
      TradeEntryFilter(
        query = q,
        dateFrom = dateFrom,
        dateTo = dateTo,
        plays = play,
        patterns = pattern,
        status = status,
      ),
      pageable,
    )

  @GetMapping("/{id}") fun findById(@PathVariable id: UUID): TradeEntryDto = service.findById(id)

  /**
   * CSV export of every trade for the current user. Roundtrip-safe with the future import flow —
   * column layout owned by `TradeEntryCsvEncoder`. The response is a `text/csv` attachment with a
   * dated filename so the browser triggers a download.
   */
  @GetMapping("/export", produces = ["text/csv"])
  fun exportCsv(): ResponseEntity<ByteArray> {
    val csv = service.exportAllAsCsv().toByteArray(Charsets.UTF_8)
    val filename = "journal-export-${LocalDate.now()}.csv"
    return ResponseEntity.ok()
      .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
      .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
      .body(csv)
  }

  /**
   * CSV import — accepts a `multipart/form-data` upload with a `file` part. Atomic batch : if the
   * decoder surfaces any error, no trade is persisted (cf. [TradeEntryService.importCsv]). The
   * response body always returns 200 with an [ImportResult] ; per-row errors are surfaced in
   * `errors` rather than as a 4xx so the frontend can render them inline.
   */
  @PostMapping("/import", consumes = ["multipart/form-data"])
  fun importCsv(@RequestParam("file") file: MultipartFile): ImportResult {
    val csv = String(file.bytes, Charsets.UTF_8)
    return service.importCsv(csv)
  }

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
