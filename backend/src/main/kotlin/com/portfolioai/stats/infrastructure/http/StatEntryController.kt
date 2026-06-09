package com.portfolioai.stats.infrastructure.http

import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.ImportResult
import com.portfolioai.stats.application.dto.StatEntryDto
import io.swagger.v3.oas.annotations.tags.Tag
import java.time.LocalDate
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.web.PageableDefault
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile

@Tag(
  name = "Stats",
  description = "Trade-stats — global `stat_entry` dataset : ADMIN-only CSV import, open CSV export",
)
@RestController
@RequestMapping("/api/stats")
class StatEntryController(private val service: StatEntryService) {

  /**
   * Filtered-free, paginated listing of the global `stat_entry` dataset. Readable by any
   * authenticated user (no per-user scoping ; only the import is ADMIN-gated). Unlike the journal
   * this exposes no filter params yet — the table is the whole shared dataset, browsable page by
   * page. Charts / aggregates land in phase 2.
   *
   * Standard Spring `Pageable` — clients pass `?page=0&size=50&sort=pushPercent,desc`. Default : 50
   * rows per page, sorted `tradeDate` desc then `createdAt` desc (latest rows on page 0). The sort
   * fallback is owned by the service (cf. [StatEntryService.findAllPaged]) so a URL `sort` is
   * always honoured. Response body is Spring's `Page<T>` shape.
   */
  @GetMapping
  fun findAll(@PageableDefault(size = 50) pageable: Pageable): Page<StatEntryDto> =
    service.findAllPaged(pageable)

  /**
   * CSV export of the whole stats table. Readable by any authenticated user (the dataset is global
   * ; only the import is ADMIN-gated). Column layout is owned by `StatEntryCsvEncoder` and is
   * **identical to the import** (roundtrip-safe ; computed `%push` / `%LOD` / `%EOD` omitted). The
   * response is a `text/csv` attachment with a dated filename so the browser triggers a download.
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
   * CSV import — accepts a `multipart/form-data` upload with a `file` part. Atomic batch : if the
   * decoder surfaces any error, no row is persisted (cf. [StatEntryService.importCsv]). The
   * response always returns 200 with an [ImportResult] ; per-row errors are surfaced in `errors`
   * rather than as a 4xx so the frontend can render them inline.
   */
  @PostMapping("/import", consumes = ["multipart/form-data"])
  fun importCsv(@RequestParam("file") file: MultipartFile): ImportResult {
    val csv = String(file.bytes, Charsets.UTF_8)
    return service.importCsv(csv)
  }
}
