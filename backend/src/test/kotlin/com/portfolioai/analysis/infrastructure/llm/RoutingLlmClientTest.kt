package com.portfolioai.analysis.infrastructure.llm

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Tests on [RoutingLlmClient]. Mirror of
 * [com.portfolioai.news.infrastructure.news.RoutingNewsClientTest] for the LLM side — both clients
 * are always wired and the router picks one per call based on the runtime value of
 * [ConfigKeys.LLM_PROVIDER].
 *
 * What we pin :
 * - **complete dispatches** to the matching adapter — flipping `llm.provider` at runtime must land
 *   on the next call without a reboot.
 * - **modelId dispatches too** — the snapshot writer reads it after every narrative call ; a router
 *   that returned a static "router" string would lose the per-call truth ("which model actually
 *   answered ?") that we rely on for historical comparisons.
 * - **Unknown provider** raises — defends against a typo in `llm.provider` that the validator
 *   somehow let through.
 */
class RoutingLlmClientTest {

  private val claude: LlmClient = mock()
  private val ollama: LlmClient = mock()
  private val appConfig: AppConfigService = mock()

  @Test
  fun `dispatches complete to claude when provider is claude`() {
    whenever(appConfig.getString(ConfigKeys.LLM_PROVIDER)).doReturn(ConfigKeys.PROVIDER_CLAUDE)
    whenever(claude.complete(any(), any(), any())).doReturn("from-claude")

    val router = RoutingLlmClient(claude, ollama, appConfig)
    val result = router.complete("system", "user", 100)

    assertEquals("from-claude", result)
    verify(claude).complete("system", "user", 100)
    verify(ollama, never()).complete(any(), any(), any())
  }

  @Test
  fun `dispatches complete to ollama when provider is ollama`() {
    whenever(appConfig.getString(ConfigKeys.LLM_PROVIDER)).doReturn(ConfigKeys.PROVIDER_OLLAMA)
    whenever(ollama.complete(any(), any(), any())).doReturn("from-ollama")

    val router = RoutingLlmClient(claude, ollama, appConfig)
    val result = router.complete("system", "user", 100)

    assertEquals("from-ollama", result)
    verify(ollama).complete("system", "user", 100)
    verify(claude, never()).complete(any(), any(), any())
  }

  @Test
  fun `modelId dispatches to the active adapter`() {
    // The snapshot writer reads modelId() right after the narrative call — if the router cached
    // a stale provider here, two narratives saved seconds apart could carry mismatched model
    // tags vs the response that actually produced them.
    whenever(appConfig.getString(ConfigKeys.LLM_PROVIDER)).doReturn(ConfigKeys.PROVIDER_OLLAMA)
    whenever(ollama.modelId()).doReturn("ollama:qwen2.5:3b")

    val router = RoutingLlmClient(claude, ollama, appConfig)

    assertEquals("ollama:qwen2.5:3b", router.modelId())
    verify(claude, never()).modelId()
  }

  @Test
  fun `raises IllegalArgumentException on an unknown provider`() {
    whenever(appConfig.getString(eq(ConfigKeys.LLM_PROVIDER))).doReturn("openai")

    val router = RoutingLlmClient(claude, ollama, appConfig)

    val ex = assertThrows<IllegalArgumentException> { router.complete("s", "u", 50) }
    assertTrue(ex.message?.contains("openai") ?: false)
  }
}
