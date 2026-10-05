package com.portfolioai.locate.infrastructure.http

import com.portfolioai.locate.application.LocateService
import com.portfolioai.locate.application.dto.LocateDto
import com.portfolioai.locate.application.dto.LocateRequest
import com.portfolioai.locate.application.dto.LocateUpdateRequest
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
    "Shares located before a short — paid whether or not the trade happens, a cost on a day and a ticker.",
)
@RestController
@RequestMapping("/api/locates")
class LocateController(private val service: LocateService) {

  /** A day's locates, narrowed to one ticker with `&ticker=`. */
  @GetMapping
  fun list(
    @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate,
    @RequestParam(required = false) ticker: String?,
  ): List<LocateDto> = service.listForDate(date, ticker)

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
