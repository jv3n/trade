package com.portfolioai.shared

import io.sentry.Hint
import io.sentry.SentryEvent
import jakarta.servlet.FilterChain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.slf4j.MDC
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

/**
 * Pins how a request's trace id reaches its log lines and its GlitchTip events (#555).
 *
 * - **The trace id is the part of `X-Cloud-Trace-Context` before the `/`**, in the MDC for the
 *   whole request and gone after it — Tomcat's threads are pooled, a leftover would mislabel the
 *   next request.
 * - **A missing or malformed header leaves the MDC alone.**
 * - **An event captured during the request carries the trace id as a tag**, the way back from
 *   GlitchTip to the request's lines.
 */
class CloudTraceFilterTest {

  @AfterEach fun clearMdc() = MDC.clear()

  @Test
  fun `puts the trace id in the MDC for the request, and only for it`() {
    val seen = traceIdDuring("$TRACE_ID/1;o=1")

    assertEquals(TRACE_ID, seen)
    assertNull(MDC.get(CloudTraceFilter.TRACE_ID_KEY))
  }

  @Test
  fun `ignores a request without the header`() {
    assertNull(traceIdDuring(header = null))
  }

  @Test
  fun `ignores a header that is not a trace id`() {
    assertNull(traceIdDuring("not-a-trace/1;o=1"))
  }

  @Test
  fun `tags an event captured during a request with its trace id`() {
    MDC.put(CloudTraceFilter.TRACE_ID_KEY, TRACE_ID)

    val event = SentryTraceTag().execute(SentryEvent(), Hint())

    assertEquals(TRACE_ID, event.getTag(SentryTraceTag.TAG))
  }

  @Test
  fun `leaves an event captured outside a request untagged`() {
    val event = SentryTraceTag().execute(SentryEvent(), Hint())

    assertNull(event.getTag(SentryTraceTag.TAG))
  }

  private fun traceIdDuring(header: String?): String? {
    val request = MockHttpServletRequest()
    header?.let { request.addHeader(CloudTraceFilter.TRACE_HEADER, it) }
    var seen: String? = null
    val chain = FilterChain { _, _ -> seen = MDC.get(CloudTraceFilter.TRACE_ID_KEY) }
    CloudTraceFilter().doFilter(request, MockHttpServletResponse(), chain)
    return seen
  }

  private companion object {
    const val TRACE_ID = "105445aa7843bc8bf206b12000100000"
  }
}
