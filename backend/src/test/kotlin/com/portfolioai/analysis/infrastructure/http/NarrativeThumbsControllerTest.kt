package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.PromptScoreService
import com.portfolioai.analysis.domain.PromptScore
import com.portfolioai.shared.GlobalExceptionHandler
import java.util.UUID
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.eq
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice on [NarrativeThumbsController] — Phase 3 PR5. The PATCH endpoint is the only
 * HTTP surface for user feedback today ; pinning the wire shape here protects the dossier ticker
 * from a silent rename of `value` / `userThumbs` on the wire.
 *
 * What we pin :
 *
 * - **200 + updated DTO** on success — `userThumbs` round-trips so the optimistic UI can confirm
 *   what the server persisted (no skipped-on-no-change optimisation, see the service-side spec).
 * - **400 on out-of-range value** — the DB CHECK constraint already enforces `{-1, 0, 1}` but the
 *   controller surfaces it as a clean validation error rather than letting the integrity violation
 *   bubble.
 * - **404 on unknown snapshot** — same `NoSuchElementException` path as the other endpoints,
 *   handled uniformly by [GlobalExceptionHandler].
 */
@WebMvcTest(NarrativeThumbsController::class, GlobalExceptionHandler::class)
@AutoConfigureMockMvc(addFilters = false)
class NarrativeThumbsControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var service: PromptScoreService

  @Test
  fun `PATCH thumbs returns 200 with the updated user thumbs value`() {
    val snapshotId = UUID.fromString("11111111-2222-3333-4444-555555555555")
    given(service.setThumbs(eq(snapshotId), eq(1.toShort())))
      .willReturn(scoreRow(snapshotId, thumbs = 1))

    mvc
      .perform(
        patch("/api/narrative/snapshots/$snapshotId/thumbs")
          .contentType(MediaType.APPLICATION_JSON)
          .accept(MediaType.APPLICATION_JSON)
          .content("""{"value":1}""")
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.snapshotId").value(snapshotId.toString()))
      .andExpect(jsonPath("$.userThumbs").value(1))
  }

  @Test
  fun `PATCH thumbs accepts the neutral 0 value to reset`() {
    val snapshotId = UUID.fromString("22222222-3333-4444-5555-666666666666")
    given(service.setThumbs(eq(snapshotId), eq(0.toShort())))
      .willReturn(scoreRow(snapshotId, thumbs = 0))

    mvc
      .perform(
        patch("/api/narrative/snapshots/$snapshotId/thumbs")
          .contentType(MediaType.APPLICATION_JSON)
          .accept(MediaType.APPLICATION_JSON)
          .content("""{"value":0}""")
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.userThumbs").value(0))
  }

  @Test
  fun `PATCH thumbs returns 400 when the service rejects an out-of-range value`() {
    val snapshotId = UUID.fromString("33333333-4444-5555-6666-777777777777")
    given(service.setThumbs(eq(snapshotId), eq(7.toShort())))
      .willThrow(IllegalArgumentException("thumbs value must be -1, 0, or 1 (got 7)"))

    mvc
      .perform(
        patch("/api/narrative/snapshots/$snapshotId/thumbs")
          .contentType(MediaType.APPLICATION_JSON)
          .accept(MediaType.APPLICATION_JSON)
          .content("""{"value":7}""")
      )
      .andExpect(status().isBadRequest)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `PATCH thumbs returns 404 when no score row exists for the snapshot`() {
    val snapshotId = UUID.fromString("44444444-5555-6666-7777-888888888888")
    given(service.setThumbs(eq(snapshotId), eq(1.toShort())))
      .willThrow(NoSuchElementException("No prompt_score row for snapshot $snapshotId"))

    mvc
      .perform(
        patch("/api/narrative/snapshots/$snapshotId/thumbs")
          .contentType(MediaType.APPLICATION_JSON)
          .accept(MediaType.APPLICATION_JSON)
          .content("""{"value":1}""")
      )
      .andExpect(status().isNotFound)
      .andExpect(jsonPath("$.error").exists())
  }

  private fun scoreRow(snapshotId: UUID, thumbs: Short): PromptScore =
    PromptScore(
      snapshotId = snapshotId,
      promptTemplateId = UUID.randomUUID(),
      latencyMs = 4_200,
      retryCount = 0,
      parseFailed = false,
      validatorFailed = false,
      userThumbs = thumbs,
    )
}
