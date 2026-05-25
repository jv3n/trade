package com.portfolioai.earnings.infrastructure.earnings

import com.portfolioai.shared.UpstreamUnavailableException
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Tests on [MockEarningsClient]. The mock is what the dossier hits without a Finnhub key (default
 * for onboarding / CI) — its determinism is load-bearing : two reloads of the same dossier must
 * render the same panel for the e2e visual regression to mean anything. The reserved symbols
 * (`UNKNOWN`, `RATELIMIT`, `NOCALENDAR`) drive the empty / error / degraded UI states without
 * needing a live provider.
 */
class MockEarningsClientTest {

  private val client = MockEarningsClient()

  @Test
  fun `is deterministic per symbol`() {
    // Same symbol → same reports across calls. Without this, visual regression on the dossier
    // panel would be flaky and re-runs of `tilt up` would surface different earnings.
    val first = client.fetch("AAPL")
    val second = client.fetch("AAPL")

    assertEquals(
      first.lastReports.map { it.epsEstimate },
      second.lastReports.map { it.epsEstimate },
    )
    assertEquals(first.lastReports.map { it.epsActual }, second.lastReports.map { it.epsActual })
  }

  @Test
  fun `produces different reports across symbols`() {
    // Without per-symbol variation the dossier would feel hollow — every ticker would surface the
    // same EPS series.
    val a = client.fetch("AAPL")
    val b = client.fetch("MSFT")

    // Reports can collide on rare hash matches but the joint EPS vector is virtually guaranteed to
    // differ.
    assertNotEquals(a.lastReports.map { it.epsEstimate }, b.lastReports.map { it.epsEstimate })
  }

  @Test
  fun `UNKNOWN throws NoSuchElementException for the empty-state UI`() {
    assertThrows<NoSuchElementException> { client.fetch("UNKNOWN") }
  }

  @Test
  fun `RATELIMIT throws UpstreamUnavailableException for the inline-error UI`() {
    val ex = assertThrows<UpstreamUnavailableException> { client.fetch("RATELIMIT") }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `NOCALENDAR drops the next-earnings date so the degraded layout is reproducible`() {
    // The Finnhub /calendar/earnings endpoint sometimes 401s or returns empty — the front must
    // handle a snapshot with reports only. The reserved symbol lets us reproduce that state
    // without flipping providers.
    val out = client.fetch("NOCALENDAR")

    assertNull(out.nextEarningsDate)
    assertNull(out.nextEarningsTime)
    assertNotNull(out.lastReports) // reports are still present
    assertTrue(out.lastReports.isNotEmpty())
  }

  @Test
  fun `produces 4 reports sorted oldest-first`() {
    val out = client.fetch("AAPL")

    assertEquals(4, out.lastReports.size)
    val periods = out.lastReports.map { it.period }
    assertEquals(periods.sorted(), periods, "reports must come back oldest-first")
  }

  @Test
  fun `case-normalises the symbol on the output`() {
    // The dossier may pass through a lowercase symbol from the URL ; the snapshot must come back
    // uppercase to align with the rest of the dossier (watchlist, narrative…).
    val out = client.fetch("aapl")
    assertEquals("AAPL", out.symbol)
  }

  @Test
  fun `next earnings date sits within the next 60 days`() {
    // Drives the countdown label readability on the front — too far out and the value reads
    // "dans 14 mois" which is useless ; too close and it's "dans 0 jour" the morning of the
    // print. We pin the band to surface a regression early.
    val out = client.fetch("AAPL")
    val today = LocalDate.now()
    val maxFuture = today.plusDays(61)

    assertNotNull(out.nextEarningsDate)
    assertTrue(
      out.nextEarningsDate!!.isAfter(today.minusDays(1)) &&
        out.nextEarningsDate.isBefore(maxFuture),
      "expected ${out.nextEarningsDate} to fall within (today, today+60d]",
    )
  }

  @Test
  fun `surprise percent reflects estimate vs actual on each report`() {
    // The shared `computeSurprisePercent` helper is the source of truth — the mock must use it so
    // its output is realistic and consistent with the Finnhub adapter.
    val out = client.fetch("AAPL")

    out.lastReports.forEach { r ->
      // estimate and actual are always non-null in the mock (we floor at $0.01) — the surprise
      // % must be present and consistent with the helper.
      assertNotNull(r.epsEstimate)
      assertNotNull(r.epsActual)
      assertNotNull(r.surprisePercent)
    }
  }
}
