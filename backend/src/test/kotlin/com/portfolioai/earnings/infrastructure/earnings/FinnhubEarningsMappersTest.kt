package com.portfolioai.earnings.infrastructure.earnings

import com.portfolioai.earnings.domain.EarningsTime
import java.math.BigDecimal
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Tests on the pure conversion `toEarningsSnapshot` — no HTTP, no Spring. Each test pins a
 * non-obvious behaviour observed on the Finnhub payload :
 *
 * - **Reports array is sorted defensively** — Finnhub documents newest-first but we don't trust the
 *   wire order. The mapper sorts by period before deciding what's history.
 * - **Empty reports AND empty calendar → 404** — there's no data at all to surface. The
 *   `NoSuchElementException` flows through the global handler to surface as HTTP 404 on the front,
 *   which renders an "no earnings data" empty state distinct from a 503 (provider down).
 * - **Reports with empty calendar still render** — the report breakdown is useful on its own when
 *   the calendar endpoint failed soft.
 * - **Next announcement = earliest entry with null `epsActual`** — Finnhub occasionally lists the
 *   just-reported quarter on the morning of the print, so the cleanest "did it happen yet" signal
 *   is the absent actual. Filtering on `date >= today` would race with this.
 * - **Calendar items for other symbols are ignored** — the `/calendar/earnings` endpoint can return
 *   entries for adjacent tickers when called with a wide date window.
 */
class FinnhubEarningsMappersTest {

  private fun rep(period: String, estimate: String? = null, actual: String? = null) =
    FinnhubEarningsItem(
      symbol = "AAPL",
      period = period,
      estimate = estimate?.let { BigDecimal(it) },
      actual = actual?.let { BigDecimal(it) },
      surprise = null,
      surprisePercent = null,
      quarter = null,
      year = null,
    )

  private fun cal(
    date: String,
    symbol: String = "AAPL",
    epsActual: String? = null,
    hour: String? = null,
  ) =
    FinnhubEarningsCalendarItem(
      symbol = symbol,
      date = date,
      hour = hour,
      epsActual = epsActual?.let { BigDecimal(it) },
      epsEstimate = null,
    )

  @Test
  fun `picks the last 4 reports oldest-first regardless of wire order`() {
    val reports =
      listOf(
        rep("2025-12-31", estimate = "1.20", actual = "1.31"),
        rep("2024-12-31", estimate = "0.90", actual = "0.95"),
        rep("2025-09-30", estimate = "1.10", actual = "1.05"),
        rep("2025-03-31", estimate = "1.00", actual = "1.10"),
        rep("2025-06-30", estimate = "1.05", actual = "1.12"),
      )

    val out = toEarningsSnapshot("aapl", reports, calendar = null)

    // 5 reports in → 4 out (most recent), oldest-first.
    val periods = out.lastReports.map { it.period.toString() }
    assertEquals(listOf("2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"), periods)
    // Surprise % computed in-mapper (we don't trust the wire `surprisePercent`). Latest report :
    // (1.31 - 1.20) / 1.20 × 100 = 9.17.
    assertEquals(BigDecimal("9.17"), out.lastReports.last().surprisePercent)
    assertEquals("AAPL", out.symbol) // uppercased
  }

  @Test
  fun `empty reports AND null calendar throws NoSuchElementException`() {
    // Symbols Finnhub doesn't cover at all → 404 → "no earnings data" empty state.
    assertThrows<NoSuchElementException> {
      toEarningsSnapshot("AAPL", emptyList(), calendar = null)
    }
  }

  @Test
  fun `empty reports AND empty calendar throws NoSuchElementException`() {
    // The calendar endpoint succeeded but returned an empty array — same outcome as null.
    val emptyCalendar = FinnhubEarningsCalendarResponse(earningsCalendar = emptyList())
    assertThrows<NoSuchElementException> {
      toEarningsSnapshot("AAPL", emptyList(), calendar = emptyCalendar)
    }
  }

  @Test
  fun `reports with no calendar still render with null next-date`() {
    // Calendar endpoint failed soft (401/403/network) — the report breakdown is still useful.
    val out =
      toEarningsSnapshot(
        "AAPL",
        listOf(rep("2025-12-31", estimate = "1.20", actual = "1.31")),
        calendar = null,
      )

    assertNull(out.nextEarningsDate)
    assertNull(out.nextEarningsTime)
    assertEquals(1, out.lastReports.size)
  }

  @Test
  fun `calendar with only-reported entries surfaces a null next-date`() {
    // Finnhub returned entries but they all have an actual — the company already reported in the
    // window, no upcoming announcement to flag.
    val calendar =
      FinnhubEarningsCalendarResponse(
        earningsCalendar = listOf(cal("2026-01-15", epsActual = "1.31"))
      )

    val out =
      toEarningsSnapshot(
        "AAPL",
        listOf(rep("2025-12-31", estimate = "1.20", actual = "1.31")),
        calendar = calendar,
      )

    assertNull(out.nextEarningsDate)
  }

  @Test
  fun `picks the earliest upcoming entry when several future announcements are listed`() {
    // Finnhub occasionally lists multiple future quarters in a 90-day window for symbols with a
    // dense calendar. We pick the closest — that's what "next" means to the user.
    val calendar =
      FinnhubEarningsCalendarResponse(
        earningsCalendar =
          listOf(
            cal("2026-08-01"), // far one
            cal("2026-05-12"), // closer one — should win
            cal("2026-06-30"), // middle one
          )
      )

    val out =
      toEarningsSnapshot(
        "AAPL",
        listOf(rep("2025-12-31", estimate = "1.20", actual = "1.31")),
        calendar = calendar,
      )

    assertEquals(LocalDate.parse("2026-05-12"), out.nextEarningsDate)
  }

  @Test
  fun `ignores calendar entries for other symbols`() {
    // The /calendar/earnings endpoint with a wide window can return adjacent tickers. We filter
    // on the symbol so a neighbouring company doesn't pollute our snapshot.
    val calendar =
      FinnhubEarningsCalendarResponse(
        earningsCalendar =
          listOf(
            cal("2026-04-30", symbol = "MSFT"), // not us
            cal("2026-05-12", symbol = "AAPL"), // ours
          )
      )

    val out =
      toEarningsSnapshot(
        "AAPL",
        listOf(rep("2025-12-31", estimate = "1.20", actual = "1.31")),
        calendar = calendar,
      )

    assertEquals(LocalDate.parse("2026-05-12"), out.nextEarningsDate)
  }

  @Test
  fun `maps Finnhub hour codes to the EarningsTime enum`() {
    val bmo =
      toEarningsSnapshot(
        "AAPL",
        emptyList(),
        FinnhubEarningsCalendarResponse(listOf(cal("2026-05-12", hour = "bmo"))),
      )
    val amc =
      toEarningsSnapshot(
        "AAPL",
        emptyList(),
        FinnhubEarningsCalendarResponse(listOf(cal("2026-05-12", hour = "amc"))),
      )
    val unspecified =
      toEarningsSnapshot(
        "AAPL",
        emptyList(),
        FinnhubEarningsCalendarResponse(listOf(cal("2026-05-12", hour = ""))),
      )
    val unknown =
      toEarningsSnapshot(
        "AAPL",
        emptyList(),
        FinnhubEarningsCalendarResponse(listOf(cal("2026-05-12", hour = "dmh"))),
      )

    assertEquals(EarningsTime.BEFORE_MARKET, bmo.nextEarningsTime)
    assertEquals(EarningsTime.AFTER_MARKET, amc.nextEarningsTime)
    assertEquals(EarningsTime.UNSPECIFIED, unspecified.nextEarningsTime)
    // `dmh` (during market hours) is rare but documented — we collapse to UNSPECIFIED rather than
    // adding a fourth enum value the front would barely render.
    assertEquals(EarningsTime.UNSPECIFIED, unknown.nextEarningsTime)
  }

  @Test
  fun `surprise stays null when actual is missing on a quarter`() {
    // Edge case Finnhub emits for old or sparsely-covered tickers. The front renders the row
    // gracefully without a surprise chip rather than imputing 0 %.
    val out =
      toEarningsSnapshot(
        "AAPL",
        listOf(rep("2025-12-31", estimate = "1.20", actual = null)),
        calendar = null,
      )

    assertEquals(1, out.lastReports.size)
    val r = out.lastReports.single()
    assertEquals(BigDecimal("1.20"), r.epsEstimate)
    assertNull(r.epsActual)
    assertNull(r.surprisePercent)
    // The snapshot itself isn't 404 — we have report data, just no actual on this quarter.
    assertNotNull(out.lastReports)
  }
}
