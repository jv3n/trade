package com.portfolioai.shared

import io.sentry.Sentry
import io.sentry.SentryLevel
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

/**
 * Proves at every boot that error tracking reports (#462) : the backend's GlitchTip project stayed
 * empty for four months, because a mute DSN looks exactly like a quiet production. A deployed
 * environment sends one INFO event when it starts — its absence shows on the next deploy — and logs
 * a warning when it has no DSN at all. Local and CI have none by design, and stay silent.
 *
 * One event per cold start : one to four a day in production, well inside the free tier's quota.
 */
@Component
class ErrorTrackingCheck(@Value("\${info.environment}") private val environment: String) {

  private val log = LoggerFactory.getLogger(javaClass)

  @EventListener(ApplicationReadyEvent::class)
  fun reportStartup() {
    if (environment == LOCAL) return
    if (!Sentry.isEnabled()) {
      log.warn("Error tracking is off on {} : SENTRY_DSN is empty", environment)
      return
    }
    Sentry.captureMessage("Backend started", SentryLevel.INFO)
  }

  private companion object {
    const val LOCAL = "local"
  }
}
