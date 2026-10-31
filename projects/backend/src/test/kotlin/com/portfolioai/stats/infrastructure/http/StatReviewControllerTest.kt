package com.portfolioai.stats.infrastructure.http

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.shared.GlobalExceptionHandler
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.toDto
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatRejectionReason
import com.portfolioai.stats.domain.StatReview
import com.portfolioai.stats.domain.StatSource
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice for the review endpoints of [StatEntryController] (#762). The rules live in
 * [StatEntryService] and are pinned by `StatReviewIntegrationTest` ; this spec pins the HTTP
 * contract the front relies on :
 * - validate / restore take no body and answer the stat with its review ;
 * - **reject's body is optional** — none, `{}` and `{ reason }` all reach the service, the first
 *   two without a reason ;
 * - an unknown reason is a 400 before the service is called.
 */
@WebMvcTest(StatEntryController::class, GlobalExceptionHandler::class)
@AutoConfigureMockMvc(addFilters = false)
class StatReviewControllerTest {

  @Autowired private lateinit var mvc: MockMvc
  @MockitoBean private lateinit var service: StatEntryService

  private val id = UUID.randomUUID()

  @Test
  fun `validate answers the stat, now validated`() {
    given(service.validate(id)).willReturn(scanned(StatReview.VALIDATED))

    mvc
      .perform(post("/api/stats/{id}/validate", id))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.source").value("SCANNER"))
      .andExpect(jsonPath("$.review").value("VALIDATED"))
  }

  @Test
  fun `reject without a body rejects without a reason`() {
    given(service.reject(id, null)).willReturn(scanned(StatReview.REJECTED))

    mvc
      .perform(post("/api/stats/{id}/reject", id))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.review").value("REJECTED"))
  }

  @Test
  fun `reject with an empty object rejects without a reason`() {
    given(service.reject(id, null)).willReturn(scanned(StatReview.REJECTED))

    mvc
      .perform(
        post("/api/stats/{id}/reject", id).contentType(MediaType.APPLICATION_JSON).content("{}")
      )
      .andExpect(status().isOk)

    verify(service).reject(id, null)
  }

  @Test
  fun `reject passes the reason on`() {
    given(service.reject(id, StatRejectionReason.NEWS))
      .willReturn(scanned(StatReview.REJECTED, StatRejectionReason.NEWS))

    mvc
      .perform(
        post("/api/stats/{id}/reject", id)
          .contentType(MediaType.APPLICATION_JSON)
          .content("""{"reason":"NEWS"}""")
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.rejectionReason").value("NEWS"))
  }

  @Test
  fun `reject passes the note on, alone or with a reason`() {
    given(service.reject(id, null, "The Echo clears the Apex by 12 %"))
      .willReturn(scanned(StatReview.REJECTED))

    mvc
      .perform(
        post("/api/stats/{id}/reject", id)
          .contentType(MediaType.APPLICATION_JSON)
          .content("""{"note":"The Echo clears the Apex by 12 %"}""")
      )
      .andExpect(status().isOk)

    verify(service).reject(id, null, "The Echo clears the Apex by 12 %")
  }

  @Test
  fun `an unknown reason is a 400, the service never called`() {
    mvc
      .perform(
        post("/api/stats/{id}/reject", id)
          .contentType(MediaType.APPLICATION_JSON)
          .content("""{"reason":"BORING"}""")
      )
      .andExpect(status().isBadRequest)

    verify(service, never()).reject(any(), anyOrNull(), anyOrNull())
  }

  @Test
  fun `restore answers the stat back to review`() {
    given(service.restore(id)).willReturn(scanned(StatReview.TO_REVIEW))

    mvc
      .perform(post("/api/stats/{id}/restore", id))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.review").value("TO_REVIEW"))
  }

  /** NXTP of the mockup, as the scanner dropped it and as far as its review went. */
  private fun scanned(review: StatReview, reason: StatRejectionReason? = null) =
    StatEntry(
        id = id,
        user = owner,
        tradeDate = LocalDate.of(2026, 10, 22),
        ticker = "NXTP",
        source = StatSource.SCANNER,
        review = review,
        rejectionNote = null,
        rejectionReason = reason,
      )
      .toDto()

  private val owner =
    User(
      email = "trader@test.local",
      displayName = "Trader",
      provider = "test",
      providerId = null,
      role = Role.USER,
    )
}
