package com.portfolioai.watchlist.infrastructure.http

import com.portfolioai.watchlist.application.WatchlistService
import com.portfolioai.watchlist.application.dto.AddWatchlistRequest
import com.portfolioai.watchlist.application.dto.WatchlistEntryDto
import com.portfolioai.watchlist.application.dto.toDto
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/**
 * REST entry point for the watchlist feature. Three operations :
 * - `GET /api/watchlist` — list everything, oldest first (insertion order).
 * - `POST /api/watchlist` — add a symbol. **Idempotent** : posting an existing symbol returns the
 *   existing entry with HTTP 200 rather than 409, so the front doesn't have to differentiate
 *   "added" from "was already there" before calling.
 * - `DELETE /api/watchlist/{symbol}` — remove. 404 (via
 *   [com.portfolioai.shared.GlobalExceptionHandler]) when the symbol isn't on the list — unlike
 *   POST, DELETE is _not_ idempotent semantically here because the user explicitly wants to know if
 *   the operation matched a real entry.
 *
 * Symbol normalisation (uppercase + trim) is done in [WatchlistService] ; clients can send `aapl`
 * or ` AAPL ` and they round-trip as `AAPL`. Empty / over-length symbols → 400 via the
 * `IllegalArgumentException` handler.
 */
@RestController
@RequestMapping("/api/watchlist")
class WatchlistController(private val service: WatchlistService) {

  @GetMapping fun list(): List<WatchlistEntryDto> = service.list().map { it.toDto() }

  @PostMapping
  fun add(@RequestBody body: AddWatchlistRequest): WatchlistEntryDto =
    service.add(body.symbol).toDto()

  @DeleteMapping("/{symbol}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun remove(@PathVariable symbol: String) = service.remove(symbol)
}
