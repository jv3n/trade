package com.portfolioai.lexicon.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * One glossary entry — a trading [term] (English label) with its definition in **both** languages :
 * [definitionFr] and [definitionEn]. The `/lexicon` page shows the one matching the user's language
 * ; the admin editor maintains both. Both are required (NOT NULL) — there is no missing-translation
 * state.
 *
 * **Global, shared dataset** — like [com.portfolioai.stats.domain.StatEntry] and unlike
 * `TradeEntry`, the lexicon is NOT multi-tenant : there is no `user_id`. A single shared glossary,
 * readable by every authenticated user, mutated by ADMINs only (writes are gated in
 * `SecurityConfig`). The [term] is unique case-insensitively (unique index on `lower(term)` + an
 * app-layer pre-check in the service).
 *
 * Seeded bilingually from `docs/TTD/lexique/lexique.csv` (V8) ; mutated afterwards through the CRUD
 * endpoints under `/api/lexicon`.
 */
@Entity
@Table(name = "lexicon_entry")
class LexiconEntry(
  @Id val id: UUID = UUID.randomUUID(),
  @Column(nullable = false, length = 120) var term: String,
  @Column(name = "definition_fr", nullable = false, columnDefinition = "text")
  var definitionFr: String,
  @Column(name = "definition_en", nullable = false, columnDefinition = "text")
  var definitionEn: String,
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
