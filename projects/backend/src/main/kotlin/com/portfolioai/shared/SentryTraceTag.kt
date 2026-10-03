package com.portfolioai.shared

import io.sentry.Hint
import io.sentry.SentryEvent
import io.sentry.SentryOptions
import org.slf4j.MDC
import org.springframework.stereotype.Component

/**
 * Tags a GlitchTip event with the trace id of the request it was captured in — the key to that
 * request's lines in the Logs Explorer. `beforeSend` runs on the capturing thread, so the MDC set
 * by [CloudTraceFilter] is still there.
 */
@Component
class SentryTraceTag : SentryOptions.BeforeSendCallback {

  override fun execute(event: SentryEvent, hint: Hint): SentryEvent = event.apply {
    MDC.get(CloudTraceFilter.TRACE_ID_KEY)?.let { setTag(TAG, it) }
  }

  companion object {
    const val TAG = "trace_id"
  }
}
