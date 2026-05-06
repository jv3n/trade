package com.portfolioai.analyst.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Tests on the consensus derivation heuristic. The thresholds (60 % bullish/bearish, 50 % hold)
 * drive the colour of the chip the user sees on the dossier — wrong thresholds would mislead. We
 * pin the boundary cases here so a refactor doesn't accidentally drift the chip colour.
 *
 * The four labels (BUY / HOLD / SELL / MIXED) reflect a deliberate conservatism : we'd rather show
 * MIXED on a 55/45 split than flash BUY when the reality is "barely leaning". The tests below pin
 * exactly that — clear majorities go BUY/SELL/HOLD, ambiguous splits fall to MIXED.
 */
class AnalystSnapshotTest {

  @Test
  fun `clear bullish majority over 60 percent yields BUY`() {
    // 7+5 bullish out of 18 = 66.7 % — over the 60 % threshold.
    val c = deriveConsensus(strongBuy = 7, buy = 5, hold = 4, sell = 1, strongSell = 1)
    assertEquals(AnalystConsensus.BUY, c)
  }

  @Test
  fun `clear bearish majority over 60 percent yields SELL`() {
    // 4+9 bearish out of 20 = 65 % — symmetric to the BUY case.
    val c = deriveConsensus(strongBuy = 1, buy = 2, hold = 4, sell = 9, strongSell = 4)
    assertEquals(AnalystConsensus.SELL, c)
  }

  @Test
  fun `hold majority over 50 percent yields HOLD`() {
    // 11 hold out of 20 = 55 % — over the 50 % HOLD threshold but no bullish/bearish 60 %.
    val c = deriveConsensus(strongBuy = 2, buy = 3, hold = 11, sell = 3, strongSell = 1)
    assertEquals(AnalystConsensus.HOLD, c)
  }

  @Test
  fun `barely-leaning split below all thresholds yields MIXED`() {
    // 6 bullish + 5 hold + 5 bearish out of 16 = 37.5 / 31.25 / 31.25 — no group reaches its
    // threshold. MIXED is the honest answer, BUY would mislead.
    val c = deriveConsensus(strongBuy = 2, buy = 4, hold = 5, sell = 3, strongSell = 2)
    assertEquals(AnalystConsensus.MIXED, c)
  }

  @Test
  fun `exactly 60 percent bullish counts as BUY`() {
    // Threshold is `>= 0.60` — exactly 60 % must trigger BUY (not MIXED). Pin the boundary so a
    // refactor that switches to strict `>` doesn't silently drift behaviour.
    val c = deriveConsensus(strongBuy = 3, buy = 3, hold = 3, sell = 1, strongSell = 0)
    // total = 10, bullish = 6 → exactly 0.60
    assertEquals(AnalystConsensus.BUY, c)
  }

  @Test
  fun `zero analysts falls to MIXED instead of dividing by zero`() {
    // Defensive : a covered ticker always has at least one bucket non-zero, but we don't want a
    // crash if the upstream ever surfaces an all-zero row.
    val c = deriveConsensus(strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0)
    assertEquals(AnalystConsensus.MIXED, c)
  }
}
