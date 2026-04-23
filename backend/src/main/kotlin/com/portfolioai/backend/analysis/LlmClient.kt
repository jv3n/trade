package com.portfolioai.backend.analysis

interface LlmClient {
    fun complete(systemPrompt: String, userMessage: String, maxTokens: Int = 2048): String
}
