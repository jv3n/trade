package com.portfolioai.analysis.infrastructure.llm

import com.portfolioai.analysis.domain.LlmClient
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component

/**
 * Dispatches every LLM call to the right adapter based on the runtime value of
 * [ConfigKeys.LLM_PROVIDER]. Same rationale as
 * [com.portfolioai.news.infrastructure.news.RoutingNewsClient] — [MockLlmClient], [ClaudeClient]
 * and [OllamaClient] are always wired, this bean is `@Primary` and routes per call.
 *
 * [modelId] also dispatches so the snapshot stored on the narrative carries the actual model that
 * answered (`mock:narrative-v1`, `claude:claude-opus-4-6`, `ollama:qwen2.5:3b`), not a router-level
 * placeholder. That keeps the historical record honest when the user flips between providers across
 * narratives.
 */
@Component
@Primary
class RoutingLlmClient(
  @Qualifier("mockLlmClient") private val mock: LlmClient,
  @Qualifier("claudeClient") private val claude: LlmClient,
  @Qualifier("ollamaClient") private val ollama: LlmClient,
  private val appConfig: AppConfigService,
) : LlmClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun complete(systemPrompt: String, userMessage: String, maxTokens: Int): String {
    val provider = appConfig.getString(ConfigKeys.LLM_PROVIDER)
    log.debug("Routing LLM call provider={} maxTokens={}", provider, maxTokens)
    return active(provider).complete(systemPrompt, userMessage, maxTokens)
  }

  override fun modelId(): String = active(appConfig.getString(ConfigKeys.LLM_PROVIDER)).modelId()

  private fun active(provider: String): LlmClient =
    when (provider) {
      ConfigKeys.PROVIDER_MOCK -> mock
      ConfigKeys.PROVIDER_CLAUDE -> claude
      ConfigKeys.PROVIDER_OLLAMA -> ollama
      else -> throw IllegalArgumentException("Unknown LLM provider: '$provider'")
    }
}
