package com.portfolioai.stats.application.dto

import com.portfolioai.shared.Pattern

/** Body of `POST /api/stats/{id}/sibling` — the pattern of the stat born from this one (#507). */
data class StatSiblingRequest(val pattern: Pattern)
