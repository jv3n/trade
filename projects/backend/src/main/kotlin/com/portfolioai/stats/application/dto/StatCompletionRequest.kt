package com.portfolioai.stats.application.dto

/** Body of `PUT /api/stats/{id}/completion` — tick ([completed] true) or untick the stat. */
data class StatCompletionRequest(val completed: Boolean)
