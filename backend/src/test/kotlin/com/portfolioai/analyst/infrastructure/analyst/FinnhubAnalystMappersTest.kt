package com.portfolioai.analyst.infrastructure.analyst

import com.portfolioai.analyst.domain.AnalystConsensus
import java.math.BigDecimal
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Tests on the pure conversion `toAnalystSnapshot` + `FinnhubPriceTarget.toDomainOrNull` — no HTTP,
 * no Spring. Each test pins a non-obvious behaviour observed on the Finnhub payload :
 *
 * - **Recommendation array is sorted defensively** — Finnhub documents newest-first but we don't
 *   trust the wire order. The mapper sorts by period before deciding what's the head and what's
 *   history.
 * - **Empty recommendation array → 404** — a covered ticker always has at least one bucket. The
 *   `NoSuchElementException` flows through the global handler to surface as HTTP 404 on the front,
 *   which renders an "no analyst coverage" empty state distinct from a 503 (provider down).
 * - **All-zero price target → null** — Finnhub returns the shell with zeros for symbols without a
 *   target. Surfacing "$0 target" to the user would be misleading ; the mapper drops to null.
 * - **History is oldest-first in the output** — opposite of the wire order, matches the natural
 *   left-to-right trend display on the front.
 */
class FinnhubAnalystMappersTest {

  private fun rec(
    period: String,
    strongBuy: Int = 0,
    buy: Int = 0,
    hold: Int = 0,
    sell: Int = 0,
    strongSell: Int = 0,
  ) =
    FinnhubRecommendationItem(
      symbol = "AAPL",
      period = period,
      strongBuy = strongBuy,
      buy = buy,
      hold = hold,
      sell = sell,
      strongSell = strongSell,
    )

  @Test
  fun `picks the head from the most recent period and reflects the breakdown`() {
    val recs =
      listOf(
        rec("2026-01-01", strongBuy = 4, buy = 4, hold = 2),
        rec("2026-04-01", strongBuy = 7, buy = 5, hold = 3, sell = 1),
        rec("2026-03-01", strongBuy = 6, buy = 4, hold = 3, sell = 1),
      )

    val out = toAnalystSnapshot("aapl", recs, priceTarget = null)

    // Head = April even though the wire order is Jan / April / March. `asOf` and the breakdown
    // counters reflect the head, NOT the order in which the items were sent.
    assertEquals(LocalDate.parse("2026-04-01"), out.asOf)
    assertEquals(7, out.strongBuy)
    assertEquals(5, out.buy)
    assertEquals(3, out.hold)
    assertEquals(1, out.sell)
    assertEquals(0, out.strongSell)
    assertEquals(16, out.totalAnalysts)
    assertEquals("AAPL", out.symbol) // uppercased
    assertEquals(AnalystConsensus.BUY, out.consensus)
  }

  @Test
  fun `history comes back oldest-first regardless of wire order`() {
    // Wire order is shuffled — the output history must be sorted oldest-first.
    val recs =
      listOf(
        rec("2026-04-01", buy = 5),
        rec("2026-01-01", buy = 3),
        rec("2026-03-01", buy = 4),
        rec("2026-02-01", buy = 2),
      )

    val out = toAnalystSnapshot("AAPL", recs, priceTarget = null)

    val periods = out.history.map { it.period }
    assertEquals(
      listOf(
        LocalDate.parse("2026-01-01"),
        LocalDate.parse("2026-02-01"),
        LocalDate.parse("2026-03-01"),
        LocalDate.parse("2026-04-01"),
      ),
      periods,
    )
  }

  @Test
  fun `caps history at the last 6 months even when more snapshots arrive`() {
    // Defensive — Finnhub ships ~3 months in practice, but if they ever return 12+ we trim to 6
    // so the front trend bar doesn't get pixel-cramped.
    val recs = (1..10).map { rec("2025-${it.toString().padStart(2, '0')}-01", buy = it) }

    val out = toAnalystSnapshot("AAPL", recs, priceTarget = null)

    assertEquals(6, out.history.size)
    // The 6 we keep are the most recent — May → Oct 2025.
    assertEquals(LocalDate.parse("2025-05-01"), out.history.first().period)
    assertEquals(LocalDate.parse("2025-10-01"), out.history.last().period)
  }

  @Test
  fun `empty recommendation array throws NoSuchElementException`() {
    // Finnhub returns `[]` for tickers it doesn't cover. The global handler maps this to 404,
    // which the front treats as "no analyst coverage" empty state.
    assertThrows<NoSuchElementException> {
      toAnalystSnapshot("AAPL", emptyList(), priceTarget = null)
    }
  }

  @Test
  fun `all-zero price target collapses to null on the snapshot`() {
    val target =
      FinnhubPriceTarget(
        symbol = "AAPL",
        targetHigh = BigDecimal.ZERO,
        targetLow = BigDecimal.ZERO,
        targetMean = BigDecimal.ZERO,
        targetMedian = BigDecimal.ZERO,
        numberOfAnalysts = 0,
      )

    val out = toAnalystSnapshot("AAPL", listOf(rec("2026-04-01", buy = 5)), priceTarget = target)

    // Surfacing "$0 target" in the UI would mislead — null lets the front hide the line.
    assertNull(out.priceTarget)
  }

  @Test
  fun `non-empty price target maps through unchanged`() {
    val target =
      FinnhubPriceTarget(
        symbol = "AAPL",
        targetHigh = BigDecimal("280.00"),
        targetLow = BigDecimal("175.00"),
        targetMean = BigDecimal("235.50"),
        targetMedian = BigDecimal("240.00"),
        numberOfAnalysts = 41,
      )

    val out = toAnalystSnapshot("AAPL", listOf(rec("2026-04-01", buy = 5)), priceTarget = target)

    assertNotNull(out.priceTarget)
    assertEquals(BigDecimal("280.00"), out.priceTarget!!.high)
    assertEquals(41, out.priceTarget.numberOfAnalysts)
  }
}
