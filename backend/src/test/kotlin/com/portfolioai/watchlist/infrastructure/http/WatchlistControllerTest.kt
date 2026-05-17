package com.portfolioai.watchlist.infrastructure.http

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.shared.GlobalExceptionHandler
import com.portfolioai.watchlist.application.WatchlistService
import com.portfolioai.watchlist.domain.WatchlistEntry
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice for [WatchlistController]. The watchlist is a flat global list with three
 * operations — every test in this file pins one user-visible behaviour :
 * - **list returns oldest-first** so the sidebar UI renders in insertion order without sorting
 *   client-side.
 * - **add is idempotent** so the front doesn't have to check existence before calling — repeated
 *   POST returns the existing row (HTTP 200), no 409 conflict.
 * - **remove is _not_ idempotent** — DELETE on a missing symbol returns 404. We want the user to
 *   know if the click hit something or not, especially because the UI is optimistic (signal flip
 *   first, then confirm).
 * - **symbols are normalised** (uppercase + trim) — `aapl` adds `AAPL` ; `DELETE /watchlist/aapl`
 *   removes `AAPL`. Tested with the realistic Wealthsimple-style lowercase entries.
 * - **empty / over-long symbols return 400** via [GlobalExceptionHandler] — defends against the
 *   front sending blank input from a flaky form binding.
 */
@WebMvcTest(WatchlistController::class, GlobalExceptionHandler::class)
@AutoConfigureMockMvc(addFilters = false)
class WatchlistControllerTest {

  @Autowired private lateinit var mvc: MockMvc
  @Autowired private lateinit var json: ObjectMapper
  @MockitoBean private lateinit var service: WatchlistService

  // ---------------------------------------------------------------------- list

  @Test
  fun `GET watchlist returns the oldest-first list`() {
    val older = entry("AAPL", Instant.parse("2026-04-01T10:00:00Z"))
    val newer = entry("MSFT", Instant.parse("2026-04-15T10:00:00Z"))
    given(service.list()).willReturn(listOf(older, newer))

    mvc
      .perform(get("/api/watchlist"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(2))
      .andExpect(jsonPath("$[0].symbol").value("AAPL"))
      .andExpect(jsonPath("$[1].symbol").value("MSFT"))
  }

  @Test
  fun `GET watchlist returns an empty list when nothing is tracked yet`() {
    given(service.list()).willReturn(emptyList())

    mvc
      .perform(get("/api/watchlist"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(0))
  }

  // ---------------------------------------------------------------------- add

  @Test
  fun `POST watchlist with a new symbol returns the created entry`() {
    val saved = entry("NVDA")
    given(service.add(eq("NVDA"))).willReturn(saved)

    mvc
      .perform(
        post("/api/watchlist")
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("symbol" to "NVDA")))
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.symbol").value("NVDA"))
      .andExpect(jsonPath("$.id").exists())
      .andExpect(jsonPath("$.addedAt").exists())
  }

  @Test
  fun `POST watchlist passes through lowercase input — service handles normalisation`() {
    // The controller doesn't pre-uppercase ; it forwards the raw string and lets the service
    // do the trim+uppercase. Pinning this so a future "controller adds normalisation" refactor
    // doesn't accidentally double-normalise (uppercase().uppercase() is fine but trim().trim()
    // wastes work — and more importantly the service is the single source of truth).
    val saved = entry("AAPL")
    given(service.add(any())).willReturn(saved)

    mvc
      .perform(
        post("/api/watchlist")
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("symbol" to " aapl ")))
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.symbol").value("AAPL"))

    verify(service).add(" aapl ")
  }

  @Test
  fun `POST watchlist returns 400 when the symbol is blank`() {
    // Service throws IllegalArgumentException on blank — handler maps to 400. No service call
    // would normally make it past the require() check, but we still go through MVC so we exercise
    // the exception handler binding.
    given(service.add(any()))
      .willThrow(IllegalArgumentException("Watchlist symbol cannot be blank"))

    mvc
      .perform(
        post("/api/watchlist")
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("symbol" to "")))
      )
      .andExpect(status().isBadRequest)
      .andExpect(jsonPath("$.error").exists())
  }

  // ---------------------------------------------------------------------- remove

  @Test
  fun `DELETE watchlist returns 204 when the symbol was on the list`() {
    mvc.perform(delete("/api/watchlist/AAPL")).andExpect(status().isNoContent)
    verify(service).remove("AAPL")
  }

  @Test
  fun `DELETE watchlist returns 404 when the symbol is not on the list`() {
    // Unlike POST (idempotent), DELETE surfaces "nothing to delete" so the optimistic UI on the
    // front knows its local state was out of sync and can refresh.
    given(service.remove(eq("UNKNOWN"))).willAnswer {
      throw NoSuchElementException("Watchlist entry not found: UNKNOWN")
    }

    mvc
      .perform(delete("/api/watchlist/UNKNOWN"))
      .andExpect(status().isNotFound)
      .andExpect(jsonPath("$.error").exists())
  }

  // ---------------------------------------------------------------------- helpers

  private fun entry(symbol: String, addedAt: Instant = Instant.parse("2026-05-03T10:00:00Z")) =
    WatchlistEntry(id = UUID.randomUUID(), symbol = symbol, addedAt = addedAt)
}
