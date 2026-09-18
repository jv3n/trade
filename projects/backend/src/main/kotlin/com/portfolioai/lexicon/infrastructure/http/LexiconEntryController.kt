package com.portfolioai.lexicon.infrastructure.http

import com.portfolioai.lexicon.application.LexiconEntryService
import com.portfolioai.lexicon.application.dto.LexiconEntryDto
import com.portfolioai.lexicon.application.dto.LexiconEntryRequest
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@Tag(
  name = "Lexicon",
  description = "Trading glossary — CRUD over the global, shared `lexicon_entry` dataset",
)
@RestController
@RequestMapping("/api/lexicon")
class LexiconEntryController(private val service: LexiconEntryService) {

  /**
   * Full glossary, alphabetical by term. Unpaged on purpose — the dataset is small (~120 rows) and
   * the frontend searches it client-side. Readable by any authenticated user (the read-only
   * `/lexicon` page) ; the mutations below are ADMIN-only (gated in `SecurityConfig`, driven by the
   * `/settings/lexicon` admin page).
   */
  @GetMapping fun findAll(): List<LexiconEntryDto> = service.findAll()

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  fun create(@RequestBody request: LexiconEntryRequest): LexiconEntryDto = service.create(request)

  @PutMapping("/{id}")
  fun update(@PathVariable id: UUID, @RequestBody request: LexiconEntryRequest): LexiconEntryDto =
    service.update(id, request)

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun delete(@PathVariable id: UUID) = service.delete(id)
}
