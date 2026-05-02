package com.portfolioai.analysis.infrastructure.llm

interface LlmClient {
  fun complete(systemPrompt: String, userMessage: String, maxTokens: Int = 2048): String

  /**
   * Provider-qualified model id (e.g. `claude:claude-opus-4-6`, `ollama:mistral`). Stored on the
   * narrative snapshot so we can compare outputs across model versions later.
   */
  fun modelId(): String
}
