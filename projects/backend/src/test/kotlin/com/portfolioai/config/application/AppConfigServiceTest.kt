package com.portfolioai.config.application

import com.portfolioai.config.domain.AppConfigEntry
import com.portfolioai.config.infrastructure.persistence.AppConfigRepository
import java.util.Optional
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Tests on [AppConfigService] — the layered "DB override on top of YAML default" lookup, exercised
 * on the only runtime key left : the login whitelist.
 *
 * What we pin :
 * - **Layered read** : an unset key returns the YAML default ; a set key returns the override.
 * - **No cache** : each read asks the database, so a change made through another instance counts at
 *   once (#840).
 * - **Stale rows** for keys no longer in the registry are ignored.
 * - **Validation** rejects malformed email tokens.
 * - **Unknown keys** raise — defends against typos and against the controller forwarding a path
 *   variable that doesn't match the registry.
 */
class AppConfigServiceTest {

  private val repo: AppConfigRepository = mock()

  // ---------------------------------------------------------------------- read path

  @Test
  fun `getAllowedEmails returns an empty set when no override and yaml default is empty`() {
    // A fresh deploy, before the admin posts the first list : `UserProvisioningService` then lets
    // the admins alone in.
    val service = newService()
    assertTrue(service.getAllowedEmails().isEmpty())
    assertFalse(service.isOverridden(ConfigKeys.ALLOWED_EMAILS))
  }

  @Test
  fun `getAllowedEmails parses the yaml default csv into a normalized set`() {
    // Lowercase + trim + dedup + drop blank tokens. Mirrors the parsing already done for
    // `app.admin.emails` so the same env-var shape behaves identically in both places.
    val service =
      newService(allowedEmailsDefault = " Alice@Example.com ,  ,bob@example.com,ALICE@example.com,")
    assertEquals(setOf("alice@example.com", "bob@example.com"), service.getAllowedEmails())
  }

  @Test
  fun `getAllowedEmails reads from the DB override over the yaml default`() {
    override("carol@example.com,dan@x.io")
    whenever(repo.existsById(ConfigKeys.ALLOWED_EMAILS)).thenReturn(true)
    val service = newService(allowedEmailsDefault = "alice@example.com")

    assertEquals(setOf("carol@example.com", "dan@x.io"), service.getAllowedEmails())
    assertTrue(service.isOverridden(ConfigKeys.ALLOWED_EMAILS))
  }

  @Test
  fun `a removal through another instance counts at the next read`() {
    // Production runs up to three instances : a removed email must not stay accepted on the others.
    val service = newService()
    override("alice@example.com,bob@example.com")
    assertTrue("bob@example.com" in service.getAllowedEmails())

    override("alice@example.com")

    assertEquals(setOf("alice@example.com"), service.getAllowedEmails())
  }

  @Test
  fun `defaultFor always returns the YAML default regardless of override state`() {
    // The UI renders "current vs default" ; if defaultFor returned the override, the user
    // couldn't tell what "Reset to default" would actually do.
    override("carol@example.com")
    val service = newService(allowedEmailsDefault = "alice@example.com")

    assertEquals("alice@example.com", service.defaultFor(ConfigKeys.ALLOWED_EMAILS))
  }

  @Test
  fun `a DB row for a key no longer registered is ignored`() {
    // The `app_config` table may still hold rows from removed keys (provider switches, LLM
    // settings).
    whenever(repo.existsById("llm.provider")).thenReturn(true)
    val service = newService()

    assertFalse(service.isOverridden("llm.provider"))
  }

  @Test
  fun `getString throws on an unknown key`() {
    val service = newService()
    assertThrows<IllegalArgumentException> { service.getString("nope.unknown") }
  }

  // ---------------------------------------------------------------------- write path

  @Test
  fun `set rejects an EMAILS value with a malformed token`() {
    // Strict validation : every comma-separated token must contain '@'. Defends against the typo
    // "alice@x.com bob@y.com" (space-separated) which would otherwise be saved as a single string
    // the gate never matches against — a silently-broken whitelist.
    val service = newService()
    val ex =
      assertThrows<IllegalArgumentException> {
        service.set(ConfigKeys.ALLOWED_EMAILS, "alice@example.com,not-an-email,bob@example.com")
      }
    assertTrue(ex.message?.contains("not-an-email") ?: false)
  }

  @Test
  fun `set persists a well-formed EMAILS value, which the next read returns`() {
    val service = newService()
    storeWrites()

    service.set(ConfigKeys.ALLOWED_EMAILS, "alice@example.com, bob@example.com")

    assertEquals(setOf("alice@example.com", "bob@example.com"), service.getAllowedEmails())
    verify(repo).save(any<AppConfigEntry>())
  }

  @Test
  fun `set accepts an EMAILS value that contains whitespace-only tokens`() {
    // An intermediate "comma, then nothing" save shouldn't blow up — the `isNotEmpty()` filter
    // makes the validator skip whitespace-only tokens cleanly.
    val service = newService()
    storeWrites()

    service.set(ConfigKeys.ALLOWED_EMAILS, " , , alice@example.com")

    assertEquals(setOf("alice@example.com"), service.getAllowedEmails())
  }

  @Test
  fun `set rejects an unknown key`() {
    val service = newService()
    assertThrows<IllegalArgumentException> { service.set("llm.provider", "ollama") }
  }

  @Test
  fun `reset removes the override`() {
    val service = newService(allowedEmailsDefault = "alice@example.com")
    whenever(repo.existsById(ConfigKeys.ALLOWED_EMAILS)).thenReturn(true)

    service.reset(ConfigKeys.ALLOWED_EMAILS)

    verify(repo).deleteById(ConfigKeys.ALLOWED_EMAILS)
  }

  @Test
  fun `reset is a no-op on a key that has no override`() {
    val service = newService()
    whenever(repo.existsById(ConfigKeys.ALLOWED_EMAILS)).thenReturn(false)

    service.reset(ConfigKeys.ALLOWED_EMAILS)

    verify(repo, never()).deleteById(any<String>())
  }

  // ---------------------------------------------------------------------- helpers

  private fun override(value: String) {
    whenever(repo.findById(ConfigKeys.ALLOWED_EMAILS))
      .thenReturn(Optional.of(AppConfigEntry(ConfigKeys.ALLOWED_EMAILS, value)))
  }

  /** What is saved is what the next read finds, as with a real table. */
  private fun storeWrites() {
    var stored: AppConfigEntry? = null
    whenever(repo.findById(ConfigKeys.ALLOWED_EMAILS)).thenAnswer { Optional.ofNullable(stored) }
    whenever(repo.save(any<AppConfigEntry>())).thenAnswer { invocation ->
      (invocation.arguments[0] as AppConfigEntry).also { stored = it }
    }
  }

  private fun newService(allowedEmailsDefault: String = ""): AppConfigService =
    AppConfigService(repository = repo, allowedEmailsDefault = allowedEmailsDefault)
}
