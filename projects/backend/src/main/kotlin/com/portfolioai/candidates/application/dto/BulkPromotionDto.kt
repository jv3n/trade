package com.portfolioai.candidates.application.dto

/**
 * Outcome of « Tout passer en stats » (`POST /api/candidates/promote`) — the tickers that landed on
 * the stats sheet and those left alone, so the UI can say « 4 promoted, SGBX was already in stats
 * ».
 *
 * @param promoted Tickers of the candidates copied to the sheet by this call.
 * @param skipped Tickers already in the sheet — promoted earlier, or holding that (day, ticker)
 *   slot through another stat. The action is idempotent : running it twice promotes nothing new.
 */
data class BulkPromotionDto(val promoted: List<String>, val skipped: List<String>)
