package com.portfolioai.forex.infrastructure.http

import com.portfolioai.forex.application.ForexService
import com.portfolioai.forex.application.dto.ForexRateDto
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(
  name = "Forex",
  description =
    "Foreign-exchange reference rates (ECB via Frankfurter). Read-only — used by the account page " +
      "to display the USD balance converted to another currency.",
)
@RestController
@RequestMapping("/api/forex")
class ForexController(private val service: ForexService) {

  /**
   * Latest reference rate for a pair — defaults to USD→CAD, the only pair the UI needs today.
   * Cached ~6 h on the adapter. A provider outage maps to 503 (the front-end then keeps the balance
   * in USD).
   */
  @GetMapping("/rate")
  fun rate(
    @RequestParam(defaultValue = "USD") base: String,
    @RequestParam(defaultValue = "CAD") quote: String,
  ): ForexRateDto = service.latest(base, quote)
}
