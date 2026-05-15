package com.portfolioai.market.infrastructure.http

import com.portfolioai.market.application.SymbolSearchService
import com.portfolioai.market.domain.SymbolMatch
import com.portfolioai.shared.GlobalExceptionHandler
import com.portfolioai.shared.UpstreamUnavailableException
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice for [SymbolSearchController]. The controller is a thin pass-through — every
 * test here pins a user-visible behaviour rather than the internals of the service :
 * - **Happy path** returns the `[{symbol, name, exchange}]` triplet the autocomplete consumes.
 * - **Empty results** still return 200 with `[]` — the front-end renders an empty dropdown rather
 *   than treating it as an error.
 * - **Default limit** is applied when the caller omits it.
 * - **Provider unreachable** surfaces as 503 via [GlobalExceptionHandler] — the same panel the
 *   chart endpoint shows, so the user gets a unified "réessayez dans quelques minutes" experience.
 */
@WebMvcTest(SymbolSearchController::class, GlobalExceptionHandler::class)
class SymbolSearchControllerTest {

  @Autowired private lateinit var mvc: MockMvc
  @MockitoBean private lateinit var service: SymbolSearchService

  @Test
  fun `GET search returns the matching symbols`() {
    given(service.search(eq("AA"), any()))
      .willReturn(
        listOf(
          SymbolMatch("AAPL", "Apple Inc", "NASDAQ"),
          SymbolMatch("AAP", "Advance Auto Parts Inc", "NYSE"),
        )
      )

    mvc
      .perform(get("/api/market/symbols/search").param("q", "AA"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(2))
      .andExpect(jsonPath("$[0].symbol").value("AAPL"))
      .andExpect(jsonPath("$[0].name").value("Apple Inc"))
      .andExpect(jsonPath("$[0].exchange").value("NASDAQ"))
      .andExpect(jsonPath("$[1].symbol").value("AAP"))
  }

  @Test
  fun `GET search returns empty list when nothing matches`() {
    // A no-match query is not an error — the autocomplete just shows an empty dropdown. Important
    // to pin so a future "404 on no match" refactor doesn't leak into a confusing UX.
    given(service.search(eq("ZZZZZZ"), any())).willReturn(emptyList())

    mvc
      .perform(get("/api/market/symbols/search").param("q", "ZZZZZZ"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(0))
  }

  @Test
  fun `GET search applies the default limit of 10 when not provided`() {
    given(service.search(eq("A"), eq(10))).willReturn(emptyList())

    mvc.perform(get("/api/market/symbols/search").param("q", "A")).andExpect(status().isOk)
  }

  @Test
  fun `GET search forwards an explicit limit to the service`() {
    given(service.search(eq("A"), eq(25))).willReturn(emptyList())

    mvc
      .perform(get("/api/market/symbols/search").param("q", "A").param("limit", "25"))
      .andExpect(status().isOk)
  }

  @Test
  fun `GET search returns 503 when the provider is unreachable`() {
    given(service.search(any(), any())).willThrow(UpstreamUnavailableException("rate-limited"))

    mvc
      .perform(get("/api/market/symbols/search").param("q", "AA"))
      .andExpect(status().isServiceUnavailable)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `GET search returns 400 when the q parameter is missing`() {
    // MissingServletRequestParameterException — Spring's default response is 400 even without a
    // dedicated handler, but pinning it here so a future change to GlobalExceptionHandler doesn't
    // accidentally surface this as 500.
    mvc.perform(get("/api/market/symbols/search")).andExpect(status().isBadRequest)
  }

  @Test
  fun `GET search returns 400 when q exceeds the length cap`() {
    // Defends against a runaway query (50 KB `q` would round-trip the cache key and the upstream
    // before being rejected). Cap is 100 chars — anything longer is rejected at the controller
    // boundary with no upstream call. Note : the service is never invoked, so we don't bother
    // mocking it for this test.
    val tooLong = "A".repeat(101)
    mvc
      .perform(get("/api/market/symbols/search").param("q", tooLong))
      .andExpect(status().isBadRequest)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `GET search accepts q at exactly the length cap`() {
    // Pins the boundary against a refactor that flips `<=` to `<` and silently shifts the cap by
    // one. Without this companion to the over-length test, only one side of the boundary is
    // exercised — and the regression would be invisible.
    given(service.search(any(), any())).willReturn(emptyList())
    val atCap = "A".repeat(100)

    mvc.perform(get("/api/market/symbols/search").param("q", atCap)).andExpect(status().isOk)
  }
}
