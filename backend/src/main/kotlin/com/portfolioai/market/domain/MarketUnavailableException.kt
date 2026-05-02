package com.portfolioai.market.domain

/**
 * Raised when a market data provider (Yahoo Finance) cannot serve the request : rate-limited,
 * temporary upstream error, or unreachable. Mapped to HTTP 503 by the global exception handler so
 * the UI can show a "try again later" message rather than a generic 500.
 *
 * Distinct from [NoSuchElementException], which is used when the symbol simply doesn't exist on the
 * provider — that one maps to HTTP 404.
 */
class MarketUnavailableException(message: String, cause: Throwable? = null) :
  RuntimeException(message, cause)
