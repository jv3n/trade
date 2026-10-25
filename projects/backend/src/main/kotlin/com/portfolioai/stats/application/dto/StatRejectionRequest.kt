package com.portfolioai.stats.application.dto

import com.portfolioai.stats.domain.StatRejectionReason

/** Body of `POST /api/stats/{id}/reject` — the reason is optional (#762). */
data class StatRejectionRequest(val reason: StatRejectionReason? = null)
