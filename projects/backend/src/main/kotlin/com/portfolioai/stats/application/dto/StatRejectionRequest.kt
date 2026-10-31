package com.portfolioai.stats.application.dto

import com.portfolioai.stats.domain.StatRejectionReason

/** Body of `POST /api/stats/{id}/reject` — the reason (#762) and the note (#787) are optional. */
data class StatRejectionRequest(val reason: StatRejectionReason? = null, val note: String? = null)
