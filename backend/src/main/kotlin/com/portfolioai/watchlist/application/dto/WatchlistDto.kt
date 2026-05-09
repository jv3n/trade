package com.portfolioai.watchlist.application.dto

import com.portfolioai.market.domain.InstrumentType
import com.portfolioai.watchlist.domain.WatchlistEntry
import java.time.Instant
import java.util.UUID

/**
 * Outbound representation of a watchlist entry for the front. [instrumentType] is the market-
 * domain classification (`STOCK / ETF / INDEX / OTHER`) snapshotted at POST-add time — null when
 * the lookup failed (provider rate-limited, network blip) or for entries pre-existing the V7
 * migration. Front renders no chip on null (degrade closed).
 */
data class WatchlistEntryDto(
  val id: UUID,
  val symbol: String,
  val addedAt: Instant,
  val instrumentType: InstrumentType?,
)

/** Body of `POST /api/watchlist` — only the symbol is required. */
data class AddWatchlistRequest(val symbol: String)

fun WatchlistEntry.toDto() =
  WatchlistEntryDto(id = id, symbol = symbol, addedAt = addedAt, instrumentType = instrumentType)
