package com.portfolioai.lexicon.application

import com.portfolioai.lexicon.application.dto.LexiconEntryDto
import com.portfolioai.lexicon.application.dto.LexiconEntryRequest
import com.portfolioai.lexicon.application.dto.toDto
import com.portfolioai.lexicon.domain.LexiconEntry
import com.portfolioai.lexicon.infrastructure.persistence.LexiconEntryRepository
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.Sort
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * CRUD service for the trading lexicon — a **global, shared glossary** (no per-user scoping). The
 * whole table is small (~120 rows) so the listing is unpaged : the frontend loads everything once
 * and searches client-side.
 *
 * Two invariants enforced here :
 * - **Non-blank** `term` / `definition` — trimmed, blank → 400.
 * - **Case-insensitive unique term** — "Push" and "push" are the same entry → 409 (the DB unique
 *   index on `lower(term)` is the hard backstop ; this pre-check gives a clean 409 instead of a 500
 *   on the constraint violation).
 */
@Service
class LexiconEntryService(private val repo: LexiconEntryRepository) {

  @Transactional(readOnly = true)
  fun findAll(): List<LexiconEntryDto> = repo.findAll(SORT_BY_TERM).map { it.toDto() }

  @Transactional
  fun create(request: LexiconEntryRequest): LexiconEntryDto {
    val term = cleanTerm(request.term)
    val definitionFr = cleanDefinition(request.definitionFr, "French definition")
    val definitionEn = cleanDefinition(request.definitionEn, "English definition")
    if (repo.existsByTermIgnoreCase(term)) {
      throw ResponseStatusException(HttpStatus.CONFLICT, "Lexicon term '$term' already exists")
    }
    return repo
      .save(LexiconEntry(term = term, definitionFr = definitionFr, definitionEn = definitionEn))
      .toDto()
  }

  @Transactional
  fun update(id: UUID, request: LexiconEntryRequest): LexiconEntryDto {
    val entry = repo.findById(id).orElseThrow { notFound(id) }
    val term = cleanTerm(request.term)
    val definitionFr = cleanDefinition(request.definitionFr, "French definition")
    val definitionEn = cleanDefinition(request.definitionEn, "English definition")
    if (repo.existsByTermIgnoreCaseAndIdNot(term, id)) {
      throw ResponseStatusException(HttpStatus.CONFLICT, "Lexicon term '$term' already exists")
    }
    entry.term = term
    entry.definitionFr = definitionFr
    entry.definitionEn = definitionEn
    entry.updatedAt = Instant.now()
    return repo.save(entry).toDto()
  }

  @Transactional
  fun delete(id: UUID) {
    if (!repo.existsById(id)) throw notFound(id)
    repo.deleteById(id)
  }

  private fun cleanTerm(raw: String): String =
    raw.trim().ifEmpty {
      throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Lexicon term must not be blank")
    }

  private fun cleanDefinition(raw: String, label: String): String =
    raw.trim().ifEmpty {
      throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Lexicon $label must not be blank")
    }

  private fun notFound(id: UUID) =
    ResponseStatusException(HttpStatus.NOT_FOUND, "Lexicon entry $id not found")

  companion object {
    /** Alphabetical by term — the order the glossary reads in. */
    private val SORT_BY_TERM: Sort = Sort.by(Sort.Order.asc("term").ignoreCase())
  }
}
