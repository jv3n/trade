package com.portfolioai.shared

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.MDC
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Puts the trace id Cloud Run stamps on every request (`X-Cloud-Trace-Context:
 * TRACE_ID/SPAN_ID;o=…`) into the MDC, for [GcpStructuredLogFormatter] and [SentryTraceTag]. First
 * in the chain, so the security filters' lines carry it too. Cleaned up in `finally` : Tomcat's
 * threads are pooled.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class CloudTraceFilter : OncePerRequestFilter() {

  override fun doFilterInternal(
    request: HttpServletRequest,
    response: HttpServletResponse,
    filterChain: FilterChain,
  ) {
    val traceId = request.getHeader(TRACE_HEADER)?.substringBefore('/')?.takeIf(TRACE_ID::matches)
    if (traceId == null) {
      filterChain.doFilter(request, response)
      return
    }
    MDC.put(TRACE_ID_KEY, traceId)
    try {
      filterChain.doFilter(request, response)
    } finally {
      MDC.remove(TRACE_ID_KEY)
    }
  }

  companion object {
    const val TRACE_ID_KEY = "traceId"
    const val TRACE_HEADER = "X-Cloud-Trace-Context"
    private val TRACE_ID = Regex("[0-9a-f]{32}")
  }
}
