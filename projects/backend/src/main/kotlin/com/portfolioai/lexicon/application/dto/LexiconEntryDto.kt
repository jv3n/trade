package com.portfolioai.lexicon.application.dto

import com.portfolioai.lexicon.domain.LexiconEntry
import java.time.Instant
import java.util.UUID

/**
 * Response shape for a single [LexiconEntry] — both language definitions. Flat, no nested objects.
 */
data class LexiconEntryDto(
  val id: UUID,
  val term: String,
  val definitionFr: String,
  val definitionEn: String,
  val createdAt: Instant,
  val updatedAt: Instant,
)

fun LexiconEntry.toDto() =
  LexiconEntryDto(
    id = id,
    term = term,
    definitionFr = definitionFr,
    definitionEn = definitionEn,
    createdAt = createdAt,
    updatedAt = updatedAt,
  )
