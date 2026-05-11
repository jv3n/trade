package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.PromptScoreService
import com.portfolioai.analysis.application.dto.PromptScoreDto
import com.portfolioai.analysis.application.dto.ThumbsRequest
import com.portfolioai.analysis.application.dto.toDto
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Phase 3 PR5 — user feedback loop on the dossier ticker. The thumbs PATCH lives at a path that is
 * **not** scoped under `/api/market/ticker/{symbol}/...` because the snapshot id is the natural
 * primary key — symbol context isn't needed for the lookup, and adding it would force the frontend
 * to plumb a redundant URL segment.
 *
 * Wire shape :
 * - `PATCH /api/narrative/snapshots/{snapshotId}/thumbs` with body `{ "value": 1 }` (or `-1`, `0`
 *   to reset). 200 + the updated [PromptScoreDto] on success — the frontend reads back `userThumbs`
 *   to confirm what the server persisted (the optimistic flip needs to know).
 * - 400 when the value is outside `{-1, 0, 1}` (mapped from `IllegalArgumentException` by
 *   [com.portfolioai.shared.GlobalExceptionHandler]).
 * - 404 when no score row exists for the snapshot (snapshot generated under the fallback prompt
 *   path, race against a DB cleanup, or orphan). The frontend hides the thumbs UI when
 *   `snapshot.promptTemplateId` is null so this 404 should never surface in the normal flow.
 */
@Tag(
  name = "Narrative Feedback",
  description = "Phase 3 — user 👍/👎 feedback on a generated narrative snapshot",
)
@RestController
@RequestMapping("/api/narrative/snapshots")
class NarrativeThumbsController(private val service: PromptScoreService) {

  @PatchMapping("/{snapshotId}/thumbs")
  fun setThumbs(
    @PathVariable snapshotId: UUID,
    @RequestBody request: ThumbsRequest,
  ): PromptScoreDto = service.setThumbs(snapshotId, request.value).toDto()
}
