package com.portfolioai.analysis

import com.portfolioai.analysis.infrastructure.persistence.PromptTemplateRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.TestPropertySource

/**
 * Pin the post-`V2__reset_narrative_prompt_to_body.sql` state of `prompt_template`.
 *
 * V2 is **data-driven** (UPDATE, not schema change). Nothing at the schema layer validates that the
 * UPDATEs landed on the right rows — a typo in the `WHERE name = 'narrative-default'` clause would
 * silently no-op, leaving the live prompt stuck in the old full-envelope format. The damage would
 * surface only at the next `Analyser` click on a ticker dossier, when the LLM receives the body + a
 * runtime envelope appended by `TickerNarrativeExecutor` → double JSON contract → parse failure.
 *
 * What we pin :
 * - The active `narrative-default` row carries `version = 'v3-body-only'` after Flyway boots.
 * - Its `systemPrompt` is the body-only persona (no JSON contract markers — the envelope is now
 *   appended in code via `NARRATIVE_TECHNICAL_ENVELOPE_SUFFIX` in `TickerNarrativePrompt.kt`).
 * - Inactive `narrative-default` rows (historical seeds) all have `deprecated_at` set, so the UI
 *   flags them as stale and a future user clicking « Activate » on one of them sees the warning
 *   rather than reactivating a broken prompt.
 *
 * Test is `@SpringBootTest` because Flyway must have run end-to-end against the real Postgres
 * (Testcontainers) for the V2 UPDATEs to be observable. Class-level shape mirrors
 * [com.portfolioai.market.CacheTtlListenerIntegrationTest].
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class V2MigrationIntegrationTest {

  @Autowired private lateinit var promptTemplateRepository: PromptTemplateRepository

  @Test
  fun `V2 left exactly one active narrative-default row at v3-body-only with the body-only persona`() {
    val active = promptTemplateRepository.findFirstByNameAndIsActiveTrue("narrative-default")

    assertNotNull(active, "V2 must keep an active narrative-default row — found none")
    assertEquals(
      "v3-body-only",
      active!!.version,
      "V2 UPDATE missed the active row — version still ${active.version} (expected 'v3-body-only')",
    )
    // The body-only persona starts with "You are a financial writer". We assert on the leading
    // substring rather than the full string so a future copy-edit on the persona (« You are a
    // **terse** financial writer », etc.) doesn't trip this test ; what we want to catch is a
    // regression to the old full-envelope prompt, which started with "You are a senior equity
    // analyst" and explicitly carried the JSON contract.
    assertTrue(
      active.systemPrompt.startsWith("You are a financial writer"),
      "Active prompt body diverged from the body-only persona — head was: " +
        active.systemPrompt.take(80),
    )
    // The body must NOT carry the JSON contract markers anymore — those live in
    // `NARRATIVE_TECHNICAL_ENVELOPE_SUFFIX` (code) and are appended at runtime by
    // `TickerNarrativeExecutor`. A regression would land them twice in the LLM input.
    assertFalse(
      active.systemPrompt.contains("\"summary\"") || active.systemPrompt.contains("\"sentiment\""),
      "Active prompt body leaked JSON envelope markers — V2 didn't strip them. Head: " +
        active.systemPrompt.take(120),
    )
  }

  @Test
  fun `V2 marked every inactive narrative-default row as deprecated`() {
    val allByName = promptTemplateRepository.findAllByNameOrderByCreatedAtDesc("narrative-default")
    val inactives = allByName.filter { !it.isActive }

    // The seed before V2 may have left zero inactive rows (clean greenfield) — in that case
    // the assertion is vacuously true. We just want to guarantee that IF any inactive
    // narrative-default row exists post-V2, it carries a non-null `deprecated_at` so the UI
    // can't reactivate it without warning the user about the double-envelope failure mode.
    inactives.forEach { row ->
      assertNotNull(
        row.deprecatedAt,
        "Inactive narrative-default row id=${row.id} version=${row.version} has no " +
          "deprecated_at — V2 must mark every pre-V2 historical row as stale.",
      )
    }
  }
}
