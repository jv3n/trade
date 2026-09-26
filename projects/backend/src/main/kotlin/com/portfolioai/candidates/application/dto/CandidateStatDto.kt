package com.portfolioai.candidates.application.dto

import com.portfolioai.shared.Pattern
import java.util.UUID

/**
 * A stat a candidate became — one per pattern (#434) ; its « in stats » badge links to [statId].
 */
data class CandidateStatDto(val pattern: Pattern, val statId: UUID)
