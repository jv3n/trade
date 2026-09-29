package com.portfolioai.shared

import io.sentry.Sentry
import io.sentry.SentryEvent
import io.sentry.SentryLevel
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow

/**
 * Pins the boot-time proof that error tracking reports (#462) — the backend's GlitchTip project
 * stayed empty for four months because a mute DSN looked exactly like a quiet production.
 *
 * - **A deployed environment sends one INFO event at boot**, so its absence shows on a deploy.
 * - **Local never does**, even with a DSN at hand : a dev machine is not an environment to watch.
 * - **No DSN is a warning, not a crash** : the app still starts.
 *
 * The SDK is initialised for real, with a `beforeSend` that keeps the events and sends none.
 */
class ErrorTrackingCheckTest {

  private val sent = mutableListOf<SentryEvent>()

  @AfterEach fun closeSentry() = Sentry.close()

  @Test
  fun `a deployed environment reports its boot with one info event`() {
    startSentry()

    ErrorTrackingCheck("staging").reportStartup()

    assertEquals(1, sent.size)
    assertEquals("Backend started", sent.single().message?.formatted)
    assertEquals(SentryLevel.INFO, sent.single().level)
  }

  @Test
  fun `local stays silent, even with a DSN`() {
    startSentry()

    ErrorTrackingCheck("local").reportStartup()

    assertTrue(sent.isEmpty())
  }

  @Test
  fun `a deployed environment without a DSN still starts`() {
    // The SDK is global : without this, a hub left open by another test would skip the no-DSN path.
    assertFalse(Sentry.isEnabled())

    assertDoesNotThrow { ErrorTrackingCheck("prod").reportStartup() }
  }

  private fun startSentry() = Sentry.init { options ->
    options.dsn = "https://public@glitchtip.invalid/1"
    options.setBeforeSend { event, _ ->
      sent += event
      null
    }
  }
}
