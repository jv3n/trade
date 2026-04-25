package com.portfolioai.analysis.infrastructure.llm

interface LlmClient {
    fun complete(systemPrompt: String, userMessage: String, maxTokens: Int = 2048): String
}
