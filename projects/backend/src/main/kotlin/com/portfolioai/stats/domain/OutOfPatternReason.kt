package com.portfolioai.stats.domain

import java.math.BigDecimal

/**
 * Why the recorded prices say a stat was not the setup (#499) — « did not meet the criteria »,
 * never « did not work ». Only what the stored prices verify at the moment of the entry : never the
 * gap (the app's gap is not the scanner's), and not the hold until a threshold exists.
 */
enum class OutOfPatternReason {
  /** A double top whose retest reached the top : a breakout, the pattern never formed. */
  RETEST_TOOK_TOP,
  /** The open outside the price range of the pattern sheet. */
  PRICE_OUT_OF_RANGE;

  companion object {
    /** The GUS price range, per `docs/pattern/GUS.md` (« ~$0.30 – $10 »). */
    val GUS_MIN_PRICE = BigDecimal("0.30")
    val GUS_MAX_PRICE = BigDecimal("10")
  }
}
