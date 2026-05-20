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
import org.springframework.context.ApplicationEventPublisher

/**
 * Tests on [AppConfigService] — the layered "DB override on top of YAML default" lookup, the write-
 * through cache, and the [ConfigChangedEvent] publication contract.
 *
 * What we pin :
 * - **Layered read** : an unset key returns the YAML default ; a set key returns the override.
 * - **Cache priming** at boot makes overrides visible without a fresh DB hit on every read.
 * - **set / reset** publish a [ConfigChangedEvent] so [com.portfolioai.market.CacheTtlListener] can
 *   rebuild the Caffeine spec when TTL changes — but only when the value actually moves (idempotent
 *   set on the same value should not fire).
 * - **Validation** rejects out-of-range TTLs and non-integer values for INT keys.
 * - **Unknown keys** raise — defends against typos and against the controller forwarding a path
 *   variable that doesn't match the registry.
 */
class AppConfigServiceTest {

  private val repo: AppConfigRepository = mock()
  private val publisher: ApplicationEventPublisher = mock()

  // ---------------------------------------------------------------------- read path

  @Test
  fun `returns the YAML default when no override is set`() {
    val service = newService()

    assertEquals("yaml-twelve", service.getString(ConfigKeys.TWELVEDATA_API_KEY))
    assertEquals("yaml-finn", service.getString(ConfigKeys.FINNHUB_API_KEY))
    assertEquals(15, service.getInt(ConfigKeys.CACHE_TTL_MINUTES))
    assertFalse(service.isOverridden(ConfigKeys.TWELVEDATA_API_KEY))
  }

  @Test
  fun `returns the DB override when one is set`() {
    whenever(repo.findAll())
      .thenReturn(listOf(AppConfigEntry(ConfigKeys.TWELVEDATA_API_KEY, "from-db")))
    val service = newService()

    assertEquals("from-db", service.getString(ConfigKeys.TWELVEDATA_API_KEY))
    assertTrue(service.isOverridden(ConfigKeys.TWELVEDATA_API_KEY))
    // Sibling keys remain on their YAML default — overrides are independent.
    assertEquals("yaml-finn", service.getString(ConfigKeys.FINNHUB_API_KEY))
  }

  @Test
  fun `defaultFor always returns the YAML default regardless of override state`() {
    // The UI uses defaultFor to render "current vs default" indicators ; if it returned the
    // current value when an override exists, the user couldn't tell what "Reset to default"
    // would actually do.
    whenever(repo.findAll()).thenReturn(listOf(AppConfigEntry(ConfigKeys.CACHE_TTL_MINUTES, "30")))
    val service = newService()

    assertEquals(30, service.getInt(ConfigKeys.CACHE_TTL_MINUTES))
    assertEquals("15", service.defaultFor(ConfigKeys.CACHE_TTL_MINUTES))
  }

  @Test
  fun `getString throws on an unknown key`() {
    val service = newService()
    assertThrows<IllegalArgumentException> { service.getString("nope.unknown") }
  }

  // ---------------------------------------------------------------------- write path

  @Test
  fun `set persists the override and updates the in-memory cache`() {
    val service = newService()
    whenever(repo.findById(ConfigKeys.TWELVEDATA_API_KEY)).thenReturn(Optional.empty())
    whenever(repo.save(any<AppConfigEntry>())).thenAnswer { it.arguments[0] as AppConfigEntry }

    service.set(ConfigKeys.TWELVEDATA_API_KEY, "rotated-key")

    // Subsequent read returns the new value without hitting the repository again.
    assertEquals("rotated-key", service.getString(ConfigKeys.TWELVEDATA_API_KEY))
    verify(repo).save(any<AppConfigEntry>())
  }

  @Test
  fun `set publishes ConfigChangedEvent when the value moves`() {
    val service = newService()
    whenever(repo.findById(ConfigKeys.CACHE_TTL_MINUTES)).thenReturn(Optional.empty())
    whenever(repo.save(any<AppConfigEntry>())).thenAnswer { it.arguments[0] as AppConfigEntry }

    service.set(ConfigKeys.CACHE_TTL_MINUTES, "30")

    verify(publisher).publishEvent(ConfigChangedEvent(ConfigKeys.CACHE_TTL_MINUTES, "30"))
  }

  @Test
  fun `set does not publish when the value is unchanged`() {
    // The TTL listener rebuilds the Caffeine spec — we don't want to invalidate the cache on a
    // no-op save (e.g. the front re-saves the current value). The "previous == new" branch
    // suppresses the event.
    whenever(repo.findAll()).thenReturn(listOf(AppConfigEntry(ConfigKeys.CACHE_TTL_MINUTES, "30")))
    val service = newService()
    whenever(repo.findById(ConfigKeys.CACHE_TTL_MINUTES))
      .thenReturn(Optional.of(AppConfigEntry(ConfigKeys.CACHE_TTL_MINUTES, "30")))
    whenever(repo.save(any<AppConfigEntry>())).thenAnswer { it.arguments[0] as AppConfigEntry }

    service.set(ConfigKeys.CACHE_TTL_MINUTES, "30")

    verify(publisher, never()).publishEvent(any<ConfigChangedEvent>())
  }

  @Test
  fun `set rejects out-of-range TTL`() {
    val service = newService()
    assertThrows<IllegalArgumentException> { service.set(ConfigKeys.CACHE_TTL_MINUTES, "120") }
    assertThrows<IllegalArgumentException> { service.set(ConfigKeys.CACHE_TTL_MINUTES, "2") }
  }

  @Test
  fun `set rejects non-integer value on an INT key`() {
    val service = newService()
    assertThrows<IllegalArgumentException> { service.set(ConfigKeys.CACHE_TTL_MINUTES, "abc") }
  }

  @Test
  fun `set rejects an unknown key`() {
    val service = newService()
    assertThrows<IllegalArgumentException> { service.set("nope.unknown", "value") }
  }

  @Test
  fun `set rejects a value outside the allowed list on an ENUM key`() {
    // Provider keys are constrained to a fixed list — typos like 'twelve_data' or 'twelve-data'
    // would silently route nowhere if the validator let them through. Failing fast at write time
    // means the user sees the error in the Save button area, not as a 503 on the next dossier.
    val service = newService()
    assertThrows<IllegalArgumentException> {
      service.set(ConfigKeys.MARKET_PROVIDER, "twelve_data")
    }
    assertThrows<IllegalArgumentException> { service.set(ConfigKeys.NEWS_PROVIDER, "google-news") }
  }

  @Test
  fun `set accepts a value inside the allowed list on an ENUM key`() {
    val service = newService()
    whenever(repo.findById(ConfigKeys.MARKET_PROVIDER)).thenReturn(Optional.empty())
    whenever(repo.save(any<AppConfigEntry>())).thenAnswer { it.arguments[0] as AppConfigEntry }

    service.set(ConfigKeys.MARKET_PROVIDER, ConfigKeys.PROVIDER_TWELVEDATA)

    assertEquals(ConfigKeys.PROVIDER_TWELVEDATA, service.getString(ConfigKeys.MARKET_PROVIDER))
  }

  @Test
  fun `set refuses to switch to a live provider when the required API key is empty`() {
    // Provider gating (Phase 4) — without this, a user could switch `market.provider=twelvedata`
    // while `market.twelvedata.api-key` is empty, and the next dossier opened would surface a 503
    // « Twelve Data API key is missing » with no in-UI way to recover. The validator blocks the
    // switch upstream with a clear 400 message naming the missing key.
    val service = newService(twelveDataApiKey = "", finnhubApiKey = "", anthropicApiKey = "")

    val ex =
      assertThrows<IllegalArgumentException> {
        service.set(ConfigKeys.MARKET_PROVIDER, ConfigKeys.PROVIDER_TWELVEDATA)
      }
    assertTrue(ex.message?.contains("market.twelvedata.api-key") ?: false)

    val newsEx =
      assertThrows<IllegalArgumentException> {
        service.set(ConfigKeys.NEWS_PROVIDER, ConfigKeys.PROVIDER_FINNHUB)
      }
    assertTrue(newsEx.message?.contains("market.finnhub.api-key") ?: false)

    val claudeEx =
      assertThrows<IllegalArgumentException> {
        service.set(ConfigKeys.LLM_PROVIDER, ConfigKeys.PROVIDER_CLAUDE)
      }
    assertTrue(claudeEx.message?.contains("anthropic.api.key") ?: false)
  }

  @Test
  fun `set allows mock provider even when no API key is configured`() {
    // The mock providers don't need any key (they're deterministic synthetic data, no network
    // call). Switching to mock must always work, even on a fresh clone with no secrets.
    val service = newService(twelveDataApiKey = "", finnhubApiKey = "", anthropicApiKey = "")
    whenever(repo.findById(ConfigKeys.MARKET_PROVIDER)).thenReturn(Optional.empty())
    whenever(repo.save(any<AppConfigEntry>())).thenAnswer { it.arguments[0] as AppConfigEntry }

    service.set(ConfigKeys.MARKET_PROVIDER, ConfigKeys.PROVIDER_MOCK)

    assertEquals(ConfigKeys.PROVIDER_MOCK, service.getString(ConfigKeys.MARKET_PROVIDER))
  }

  @Test
  fun `set rejects an unknown LLM provider value`() {
    // Same enum guarantee as the market / news providers — a typo like "claude-api" or "openai"
    // must fail at write time, not silently route nowhere when the next narrative runs.
    val service = newService()
    assertThrows<IllegalArgumentException> { service.set(ConfigKeys.LLM_PROVIDER, "openai") }
    assertThrows<IllegalArgumentException> { service.set(ConfigKeys.LLM_PROVIDER, "claude-api") }
  }

  @Test
  fun `set accepts an ollama model string with no whitelist`() {
    // The Ollama ecosystem moves fast (qwen2.5:3b, llama3.2:3b, phi4-mini, …) — keeping a strict
    // enum here would force a code change every time the user pulls a new model. The UI surfaces
    // a suggestions list but the backend trusts whatever the user typed.
    val service = newService()
    whenever(repo.findById(ConfigKeys.OLLAMA_MODEL)).thenReturn(Optional.empty())
    whenever(repo.save(any<AppConfigEntry>())).thenAnswer { it.arguments[0] as AppConfigEntry }

    service.set(ConfigKeys.OLLAMA_MODEL, "llama3.2:8b-instruct-q4_0")

    assertEquals("llama3.2:8b-instruct-q4_0", service.getString(ConfigKeys.OLLAMA_MODEL))
  }

  @Test
  fun `defaults are exposed for the new LLM keys`() {
    val service = newService()
    assertEquals("claude", service.getString(ConfigKeys.LLM_PROVIDER))
    assertEquals("qwen2.5:3b", service.getString(ConfigKeys.OLLAMA_MODEL))
    assertEquals("claude-opus-4-6", service.getString(ConfigKeys.ANTHROPIC_API_MODEL))
    assertEquals(400, service.getInt(ConfigKeys.LLM_TIMEOUT_SECONDS))
  }

  @Test
  fun `set rejects an LLM timeout outside the 60-900 range`() {
    // The slider goes from 60 s (one minute, smallest reasonable for any provider) to 900 s
    // (15 min, beyond which a still-pending analysis is a stuck process not a slow LLM).
    val service = newService()
    assertThrows<IllegalArgumentException> { service.set(ConfigKeys.LLM_TIMEOUT_SECONDS, "30") }
    assertThrows<IllegalArgumentException> { service.set(ConfigKeys.LLM_TIMEOUT_SECONDS, "1200") }
    assertThrows<IllegalArgumentException> { service.set(ConfigKeys.LLM_TIMEOUT_SECONDS, "abc") }
  }

  @Test
  fun `reset removes the override and falls back to the default`() {
    whenever(repo.findAll())
      .thenReturn(listOf(AppConfigEntry(ConfigKeys.TWELVEDATA_API_KEY, "from-db")))
    val service = newService()
    whenever(repo.existsById(ConfigKeys.TWELVEDATA_API_KEY)).thenReturn(true)

    service.reset(ConfigKeys.TWELVEDATA_API_KEY)

    assertEquals("yaml-twelve", service.getString(ConfigKeys.TWELVEDATA_API_KEY))
    assertFalse(service.isOverridden(ConfigKeys.TWELVEDATA_API_KEY))
    verify(repo).deleteById(ConfigKeys.TWELVEDATA_API_KEY)
    verify(publisher).publishEvent(ConfigChangedEvent(ConfigKeys.TWELVEDATA_API_KEY, "yaml-twelve"))
  }

  @Test
  fun `reset is a no-op on a key that has no override`() {
    val service = newService()
    whenever(repo.existsById(ConfigKeys.TWELVEDATA_API_KEY)).thenReturn(false)

    service.reset(ConfigKeys.TWELVEDATA_API_KEY)

    verify(repo, never()).deleteById(any<String>())
    verify(publisher, never()).publishEvent(any<ConfigChangedEvent>())
  }

  // ---------------------------------------------------------------------- allowed emails

  @Test
  fun `getAllowedEmails returns an empty set when no override and yaml default is empty`() {
    // Open mode (laxiste) — backward compat for a fresh deploy before the admin posts the first
    // list. `CustomOAuth2UserService` short-circuits the gate when the set is empty.
    val service = newService()
    assertTrue(service.getAllowedEmails().isEmpty())
  }

  @Test
  fun `getAllowedEmails parses the yaml default csv into a normalized set`() {
    // Lowercase + trim + dedup + drop blank tokens. Mirrors the parsing already done for
    // `app.admin.emails` so a future operator who copy-pastes the same env-var shape between the
    // two doesn't get surprised by different semantics.
    val service =
      newService(allowedEmailsDefault = " Alice@Example.com ,  ,bob@example.com,ALICE@example.com,")
    assertEquals(setOf("alice@example.com", "bob@example.com"), service.getAllowedEmails())
  }

  @Test
  fun `getAllowedEmails reads from the DB override over the yaml default`() {
    whenever(repo.findAll())
      .thenReturn(listOf(AppConfigEntry(ConfigKeys.ALLOWED_EMAILS, "carol@example.com,dan@x.io")))
    val service = newService(allowedEmailsDefault = "alice@example.com")

    assertEquals(setOf("carol@example.com", "dan@x.io"), service.getAllowedEmails())
  }

  @Test
  fun `set rejects an EMAILS value with a malformed token`() {
    // Strict validation : every comma-separated token must contain '@'. Defends against the typo
    // "alice@x.com bob@y.com" (space-separated) which would otherwise be saved as a single
    // 19-char string the gate never matches against — a silently-broken whitelist.
    val service = newService()
    val ex =
      assertThrows<IllegalArgumentException> {
        service.set(ConfigKeys.ALLOWED_EMAILS, "alice@example.com,not-an-email,bob@example.com")
      }
    assertTrue(ex.message?.contains("not-an-email") ?: false)
  }

  @Test
  fun `set accepts a well-formed EMAILS value`() {
    val service = newService()
    whenever(repo.findById(ConfigKeys.ALLOWED_EMAILS)).thenReturn(Optional.empty())
    whenever(repo.save(any<AppConfigEntry>())).thenAnswer { it.arguments[0] as AppConfigEntry }

    service.set(ConfigKeys.ALLOWED_EMAILS, "alice@example.com, bob@example.com")

    assertEquals(setOf("alice@example.com", "bob@example.com"), service.getAllowedEmails())
  }

  @Test
  fun `set accepts an empty-looking EMAILS value that contains only whitespace tokens`() {
    // The frontend "clear all" path sends `value=""` via the dedicated DELETE endpoint, but an
    // intermediate "comma, then nothing" save shouldn't blow up either — the filter on
    // `isNotEmpty()` makes the validator skip the whitespace-only tokens cleanly. Pinning so a
    // future refactor that swaps `filter { it.isNotEmpty() }` for `forEach` doesn't make the
    // edge case throw.
    val service = newService()
    whenever(repo.findById(ConfigKeys.ALLOWED_EMAILS)).thenReturn(Optional.empty())
    whenever(repo.save(any<AppConfigEntry>())).thenAnswer { it.arguments[0] as AppConfigEntry }

    service.set(ConfigKeys.ALLOWED_EMAILS, " , , alice@example.com")

    assertEquals(setOf("alice@example.com"), service.getAllowedEmails())
  }

  // ---------------------------------------------------------------------- helpers

  /**
   * Builds the service with a fixed YAML default set. Tests that need DB overrides stub
   * `repo.findAll()` _before_ calling this — `primeCache()` reads it on construction. The three
   * `*Defaults` data classes are instantiated inline here rather than mocked because they're dumb
   * value carriers (constructor-bound `@Value`s, no logic) — mocking would just re-state the field
   * set.
   */
  private fun newService(
    twelveDataApiKey: String = "yaml-twelve",
    finnhubApiKey: String = "yaml-finn",
    anthropicApiKey: String = "yaml-anthropic",
    allowedEmailsDefault: String = "",
  ): AppConfigService =
    AppConfigService(
        repository = repo,
        eventPublisher = publisher,
        secrets =
          SecretsDefaults(
            twelveDataApiKey = twelveDataApiKey,
            finnhubApiKey = finnhubApiKey,
            anthropicApiKey = anthropicApiKey,
          ),
        dataProviders =
          DataProvidersDefaults(
            marketProvider = "mock",
            newsProvider = "mock",
            analystProvider = "mock",
            earningsProvider = "mock",
          ),
        llm =
          LlmDefaults(
            llmProvider = "claude",
            ollamaModel = "qwen2.5:3b",
            anthropicApiModel = "claude-opus-4-6",
            llmTimeoutSeconds = 400,
          ),
        cacheTtlDefault = 15,
        allowedEmailsDefault = allowedEmailsDefault,
      )
      .also { it.primeCache() }
}
