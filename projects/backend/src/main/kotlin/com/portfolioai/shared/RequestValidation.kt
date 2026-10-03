package com.portfolioai.shared

import java.math.BigDecimal
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

/** The 400 a service answers a write it refuses with ; the message reaches the user. */
fun badRequest(message: String) = ResponseStatusException(HttpStatus.BAD_REQUEST, message)

fun BigDecimal.requirePositive(label: String): BigDecimal = also {
  if (it.signum() <= 0) throw badRequest("$label must be greater than zero")
}

fun BigDecimal.requireNonNegative(label: String): BigDecimal = also {
  if (it.signum() < 0) throw badRequest("$label must not be negative")
}
