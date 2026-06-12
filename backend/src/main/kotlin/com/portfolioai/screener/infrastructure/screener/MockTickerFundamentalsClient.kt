package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.screener.domain.TickerFundamentals
import com.portfolioai.screener.domain.TickerFundamentalsClient
import org.springframework.stereotype.Component

/**
 * Synthetic, deterministic-by-symbol enrichment for local dev — lets the `/radar` page exercise the
 * float + premarket-volume columns end-to-end without an FMP key. Deterministic (seeded on the
 * symbol hash) so the table stays stable across refreshes.
 *
 * The mock screener already bakes `floatShares` into its fixtures, so in mock mode the enrichment
 * keeps that value (it fills nulls only) and this adapter effectively supplies the **premarket
 * volume**. The float branch still runs for any symbol that arrives without one.
 */
@Component
class MockTickerFundamentalsClient : TickerFundamentalsClient {
  override fun fetch(symbol: String): TickerFundamentals {
    val seed = symbol.hashCode()
    // Float 3M..49M, premarket volume 0.2M..3.1M — both inside plausible GUS ranges.
    val float = 3_000_000L + Math.floorMod(seed, 47) * 1_000_000L
    val premarketVolume = 200_000L + Math.floorMod(seed / 7, 30) * 100_000L
    return TickerFundamentals(floatShares = float, premarketVolume = premarketVolume)
  }
}
