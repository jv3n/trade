package com.portfolioai.stats.infrastructure.http

import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.ImportResult
import io.swagger.v3.oas.annotations.tags.Tag
import java.time.LocalDate
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
