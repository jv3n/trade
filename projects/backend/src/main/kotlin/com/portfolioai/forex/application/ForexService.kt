package com.portfolioai.forex.application

import com.portfolioai.forex.application.dto.ForexRateDto
import com.portfolioai.forex.domain.ForexRateClient
import org.springframework.stereotype.Service

/**
 * Thin read-side façade over [ForexRateClient]. Normalises the currency codes (upper-case) and maps
 * the domain rate to its wire DTO. No business logic beyond that : amount conversion happens on the
 * client, the backend only vends the rate.
 */
@Service
class ForexService(private val client: ForexRateClient) {

  fun latest(base: String, quote: String): ForexRateDto {
    val rate = client.latest(base.uppercase(), quote.uppercase())
    return ForexRateDto(base = rate.base, quote = rate.quote, rate = rate.rate, asOf = rate.asOf)
  }
}
