package com.portfolioai.candidates.application.dto

import java.math.BigDecimal

/**
 * Shares actually short at an entry-ladder rung. [step] is the rung as a fraction of the open price
 * (e.g. `0.35` = +35 %), matching the front's `ENTRY_LADDER_STEPS`. Persisted in `candidate.fills`
 * (JSON) and overlaid onto the planned ladder to drive the live execution tracker.
 */
data class CandidateFill(val step: BigDecimal, val sharesInPlay: Int)

/**
 * A free-form short entry leg : [sharesInPlay] shares actually shorted at [entryPrice] (not bound
 * to a fixed rung, unlike [CandidateFill]). Persisted in `candidate.entries` (JSON) ; the weighted
 * average of these legs is the average short position the cover ladder scores against.
 */
data class CandidateEntry(val entryPrice: BigDecimal, val sharesInPlay: Int)

/**
 * A planned / executed cover leg : buy-to-close [sharesCovered] shares at [exitPrice]. Persisted in
 * `candidate.exits` (JSON) and scored against the average short position to build the cover ladder.
 */
data class CandidateExit(val exitPrice: BigDecimal, val sharesCovered: Int)
