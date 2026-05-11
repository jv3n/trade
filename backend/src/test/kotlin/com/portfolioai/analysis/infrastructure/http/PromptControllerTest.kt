package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.TickerNarrativePromptService
import com.portfolioai.analysis.domain.PromptTemplate
import com.portfolioai.shared.GlobalExceptionHandler
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.eq
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice on [PromptController] — Phase 3 PR3 (list / view / activate). The wire shape
 * pinned here is what the `/settings/prompts` page consumes, so a rename of a JSON field would
 * silently break the frontend.
 *
 * What we pin :
 *
 * - **`GET /api/prompts`** defaults to family `narrative-default` (single family today) and returns
 *   the list verbatim from the service. The page renders rows in the order it receives them — the
 *   service is the authority on sort.
 * - **`GET /api/prompts?name=portfolio-aggregator`** forwards a custom family to the service.
 *   Forward-compat for Phase 4 — pinned now so changing the query parameter name later breaks here
 *   rather than silently empties future family pages.
 * - **`GET /api/prompts/{id}`** returns the full DTO (system prompt body included). 404 with the
 *   standard error envelope when the id is unknown.
 * - **`POST /api/prompts/{id}/activate`** returns the activated DTO (so the frontend can update its
 *   local list without a re-fetch round-trip). 404 when the id is unknown — same
 *   `NoSuchElementException` path as `GET /{id}`.
 */
@WebMvcTest(PromptController::class, GlobalExceptionHandler::class)
class PromptControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var service: TickerNarrativePromptService

  // ---------------------------------------------------------------------- GET /api/prompts

  @Test
  fun `GET prompts returns the narrative-default family by default`() {
    val active = row(version = "v3", isActive = true)
    val deprecated = row(version = "v2", isActive = false)
    given(service.listAll(eq("narrative-default"))).willReturn(listOf(active, deprecated))

    mvc
      .perform(get("/api/prompts").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(2))
      .andExpect(jsonPath("$[0].version").value("v3"))
      .andExpect(jsonPath("$[0].isActive").value(true))
      .andExpect(jsonPath("$[1].version").value("v2"))
      .andExpect(jsonPath("$[1].isActive").value(false))
  }

  @Test
  fun `GET prompts with name query param forwards to the service`() {
    given(service.listAll(eq("portfolio-aggregator"))).willReturn(emptyList())

    mvc
      .perform(
        get("/api/prompts").param("name", "portfolio-aggregator").accept(MediaType.APPLICATION_JSON)
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(0))
  }

  // ---------------------------------------------------------------------- GET /api/prompts/{id}

  @Test
  fun `GET prompt by id returns the full DTO`() {
    val id = UUID.fromString("11111111-2222-3333-4444-555555555555")
    given(service.findById(eq(id))).willReturn(row(id = id, version = "v2", isActive = true))

    mvc
      .perform(get("/api/prompts/$id").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.id").value(id.toString()))
      .andExpect(jsonPath("$.name").value("narrative-default"))
      .andExpect(jsonPath("$.version").value("v2"))
      .andExpect(jsonPath("$.isActive").value(true))
      // System prompt body must round-trip — the page renders it verbatim in the detail view.
      .andExpect(jsonPath("$.systemPrompt").value(org.hamcrest.Matchers.containsString("body")))
  }

  @Test
  fun `GET prompt by id returns 404 when the id is unknown`() {
    val unknown = UUID.fromString("99999999-9999-9999-9999-999999999999")
    given(service.findById(eq(unknown))).willReturn(null)

    mvc
      .perform(get("/api/prompts/$unknown").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isNotFound)
      .andExpect(jsonPath("$.error").exists())
  }

  // ------------------------------------------------------------ POST /api/prompts/{id}/activate

  @Test
  fun `POST activate returns the activated DTO`() {
    val id = UUID.fromString("22222222-3333-4444-5555-666666666666")
    given(service.activate(eq(id))).willReturn(row(id = id, version = "v3", isActive = true))

    mvc
      .perform(post("/api/prompts/$id/activate").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.id").value(id.toString()))
      .andExpect(jsonPath("$.isActive").value(true))
      .andExpect(jsonPath("$.version").value("v3"))
  }

  @Test
  fun `POST activate returns 404 when the id is unknown`() {
    val unknown = UUID.fromString("99999999-9999-9999-9999-999999999999")
    given(service.activate(eq(unknown)))
      .willThrow(NoSuchElementException("Prompt template $unknown not found"))

    mvc
      .perform(post("/api/prompts/$unknown/activate").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isNotFound)
      .andExpect(jsonPath("$.error").exists())
  }

  // ---------------------------------------------------------------------- helpers

  private fun row(
    id: UUID = UUID.randomUUID(),
    version: String,
    isActive: Boolean,
  ): PromptTemplate =
    PromptTemplate(
      id = id,
      name = "narrative-default",
      version = version,
      systemPrompt = "system prompt body for $version",
      isActive = isActive,
      createdAt = Instant.parse("2026-05-09T10:00:00Z"),
      activatedAt = if (isActive) Instant.parse("2026-05-10T12:00:00Z") else null,
    )
}
