package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.TickerNarrativePromptService
import com.portfolioai.analysis.application.dto.CreatePromptInput
import com.portfolioai.analysis.application.dto.PromptTemplateDto
import com.portfolioai.analysis.application.dto.toDto
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/**
 * Phase 3 PR3+PR4 — read, activate, and create-version API for narrative prompts. The page
 * `/settings/prompts` consumes :
 *
 * - `GET /api/prompts?name=narrative-default` — list of versions for the family (default name
 *   covers today's single family ; the parameter is forward-compat for Phase 4 multi-family).
 *   Ordered most recent first by `createdAt`.
 * - `GET /api/prompts/{id}` — single row when the UI expands a list entry to show the system prompt
 *   body. 404 via [com.portfolioai.shared.GlobalExceptionHandler] when the id is unknown.
 * - `POST /api/prompts/{id}/activate` — flips the target row to active, deactivates the previously
 *   active one (atomic in [TickerNarrativePromptService.activate]). Returns the activated row so
 *   the frontend can update its local state without re-fetching the list.
 * - `POST /api/prompts` (PR4) — creates a new version row in `is_active = false` state. The
 *   activation is a separate explicit step via the endpoint above so the user can save a draft
 *   without going live ; chaining create + activate from the frontend is a UX choice, not an API
 *   coupling.
 *
 * **Why no `DELETE`** — prompts are append-only by design : a deactivated row stays in the table
 * for the historical view (« we used this prompt for 47 snapshots last week, then switched »).
 * `prompt_score` rows also reference them via FK with `ON DELETE RESTRICT`, so a delete would
 * either cascade-corrupt the score history or 23503. Keep the table immutable for now.
 */
@Tag(
  name = "Prompt Management",
  description =
    "Phase 3 — list, view, and activate the narrative prompt versions persisted in prompt_template",
)
@RestController
@RequestMapping("/api/prompts")
class PromptController(private val service: TickerNarrativePromptService) {

  @GetMapping
  fun list(
    @RequestParam(name = "name", defaultValue = "narrative-default") name: String
  ): List<PromptTemplateDto> = service.listAll(name).map { it.toDto() }

  @GetMapping("/{id}")
  fun get(@PathVariable id: UUID): PromptTemplateDto =
    service.findById(id)?.toDto() ?: throw NoSuchElementException("Prompt template $id not found")

  @PostMapping("/{id}/activate")
  fun activate(@PathVariable id: UUID): PromptTemplateDto = service.activate(id).toDto()

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  fun create(@RequestBody input: CreatePromptInput): PromptTemplateDto =
    service.create(input).toDto()
}
