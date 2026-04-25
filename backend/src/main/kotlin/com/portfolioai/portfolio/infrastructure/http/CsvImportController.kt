package com.portfolioai.portfolio.infrastructure.http

import com.portfolioai.portfolio.application.CsvImportService
import com.portfolioai.portfolio.application.dto.CsvImportPreview
import com.portfolioai.portfolio.application.dto.CsvImportResult
import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile

@RestController
@RequestMapping("/api/portfolios/import")
class CsvImportController(private val csvImportService: CsvImportService) {

  private val log = LoggerFactory.getLogger(javaClass)

  @PostMapping("/csv/preview", consumes = ["multipart/form-data"])
  fun preview(@RequestParam("file") file: MultipartFile): ResponseEntity<CsvImportPreview> =
    try {
      ResponseEntity.ok(csvImportService.preview(file))
    } catch (e: Exception) {
      log.error("CSV preview failed", e)
      ResponseEntity.badRequest().build()
    }

  @PostMapping("/csv", consumes = ["multipart/form-data"])
  fun import(@RequestParam("file") file: MultipartFile): ResponseEntity<CsvImportResult> =
    try {
      ResponseEntity.ok(csvImportService.import(file))
    } catch (e: Exception) {
      log.error("CSV import failed", e)
      ResponseEntity.badRequest().build()
    }
}
