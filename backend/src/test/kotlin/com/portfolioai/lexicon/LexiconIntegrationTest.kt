package com.portfolioai.lexicon

import com.portfolioai.lexicon.application.LexiconEntryService
import com.portfolioai.lexicon.application.dto.LexiconEntryRequest
import com.portfolioai.lexicon.infrastructure.persistence.LexiconEntryRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpStatus
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * Integration test on [LexiconEntryService] + JPA → Postgres (Testcontainers via the
 * launcher-session bootstrap). Pins the lexicon CRUD that backs the `/lexicon` page :
 *
 * - **The seed loaded** — the 117 hand-authored terms are present (bilingual) and resolve.
 * - **Listing is alphabetical** (case-insensitive) — the order the glossary reads in.
 * - **Create / update / delete** round-trip through the real DB.
 * - **Case-insensitive unique term** — a duplicate (any case) is rejected with 409, not persisted.
 * - **Blank input** is rejected with 400.
 *
 * `@Transactional` rolls back each test, so the seeded dataset stays pristine across the class (no
 * `deleteAll` plumbing). The lexicon is a **global dataset** (no `user_id`) — no `AuthService`
 * mock.
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
@Transactional
class LexiconIntegrationTest {

  @Autowired private lateinit var service: LexiconEntryService
  @Autowired private lateinit var repo: LexiconEntryRepository

  @Test
  fun `the migrations seed the full bilingual glossary`() {
    val all = service.findAll()
    assertEquals(117, all.size, "seed should load all 117 terms")
    val gus = all.single { it.term == "GUS" }
    assertEquals("Gap Up Short", gus.definitionFr, "French seed (V8)")
    assertEquals("Gap Up Short", gus.definitionEn, "English seed (V8)")
  }

  @Test
  fun `findAll returns terms in ascending alphabetical order`() {
    // Relative order of purely-alphabetic checkpoints. We assert this rather than comparing to a
    // Kotlin `sortedBy { lowercase() }` because the DB orders by `lower(term)` under its locale
    // collation (en_US) — which weighs spaces / punctuation differently than Kotlin's code-unit
    // `compareTo` (e.g. "Stop Loss" vs "Stop-Limit"). The checkpoints below avoid those edge cases.
    val terms = service.findAll().map { it.term }
    val order = listOf("Account Equity", "Bearish", "Close", "GUS", "Push", "Win Rate")
    val indices = order.map { terms.indexOf(it) }
    assertTrue(indices.none { it == -1 }, "all checkpoint terms must be present")
    assertEquals(indices.sorted(), indices, "checkpoints must appear in alphabetical order")
  }

  @Test
  fun `create persists a new term and trims the inputs`() {
    val created =
      service.create(
        LexiconEntryRequest(
          term = "  Halt  ",
          definitionFr = "  Suspension de cotation  ",
          definitionEn = "  Trading halt  ",
        )
      )

    assertNotNull(created.id)
    assertEquals("Halt", created.term, "term is trimmed")
    assertEquals("Suspension de cotation", created.definitionFr, "FR definition is trimmed")
    assertEquals("Trading halt", created.definitionEn, "EN definition is trimmed")
    assertEquals(118, repo.count())
  }

  @Test
  fun `create rejects a term that already exists, case-insensitively`() {
    // "Push" is in the seed ; "push" must collide with it.
    val ex =
      org.junit.jupiter.api.assertThrows<ResponseStatusException> {
        service.create(
          LexiconEntryRequest(term = "push", definitionFr = "doublon", definitionEn = "dup")
        )
      }
    assertEquals(HttpStatus.CONFLICT, ex.statusCode)
    assertEquals(117, repo.count(), "nothing persisted on conflict")
  }

  @Test
  fun `create rejects a blank term with 400`() {
    val ex =
      org.junit.jupiter.api.assertThrows<ResponseStatusException> {
        service.create(LexiconEntryRequest(term = "   ", definitionFr = "x", definitionEn = "y"))
      }
    assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
  }

  @Test
  fun `create rejects a blank English definition with 400`() {
    // Both definitions are mandatory — a blank EN must be rejected just like a blank term.
    val ex =
      org.junit.jupiter.api.assertThrows<ResponseStatusException> {
        service.create(
          LexiconEntryRequest(term = "Halt", definitionFr = "Suspension", definitionEn = "  ")
        )
      }
    assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
  }

  @Test
  fun `update changes both definitions and persists`() {
    val target = service.findAll().first { it.term == "GUS" }

    val updated =
      service.update(
        target.id,
        LexiconEntryRequest(
          term = "GUS",
          definitionFr = "Gap Up Short (révisé)",
          definitionEn = "Gap Up Short (revised)",
        ),
      )

    assertEquals("Gap Up Short (révisé)", updated.definitionFr)
    assertEquals("Gap Up Short (revised)", updated.definitionEn)
    assertEquals(target.id, updated.id, "same row, not a new insert")
  }

  @Test
  fun `update rejects renaming onto another existing term`() {
    val gus = service.findAll().first { it.term == "GUS" }

    // "Short" already exists in the seed — renaming GUS to it must 409.
    val ex =
      org.junit.jupiter.api.assertThrows<ResponseStatusException> {
        service.update(
          gus.id,
          LexiconEntryRequest(term = "Short", definitionFr = "x", definitionEn = "y"),
        )
      }
    assertEquals(HttpStatus.CONFLICT, ex.statusCode)
  }

  @Test
  fun `delete removes the entry`() {
    val target = service.findAll().first { it.term == "GUS" }

    service.delete(target.id)

    assertEquals(116, repo.count())
    assertTrue(service.findAll().none { it.term == "GUS" })
  }
}
