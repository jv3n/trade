package com.portfolioai.watchlist.application.dto

import com.portfolioai.watchlist.domain.WatchlistEntry
import java.time.Instant
import java.util.UUID

/** Outbound representation of a watchlist entry for the front. */
data class WatchlistEntryDto(val id: UUID, val symbol: String, val addedAt: Instant)

/** Body of `POST /api/watchlist` — only the symbol is required. */
data class AddWatchlistRequest(val symbol: String)

fun WatchlistEntry.toDto() = WatchlistEntryDto(id = id, symbol = symbol, addedAt = addedAt)
