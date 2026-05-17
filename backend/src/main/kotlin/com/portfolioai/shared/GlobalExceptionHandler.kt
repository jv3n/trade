package com.portfolioai.shared

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class GlobalExceptionHandler {

  @ExceptionHandler(NoSuchElementException::class)
  fun handleNotFound(ex: NoSuchElementException): ResponseEntity<Map<String, String>> =
    ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("error" to (ex.message ?: "Not found")))

  /**
   * User-supplied parameter is invalid (e.g. unknown `timeframe` code on the chart endpoint).
   * Surfaced as HTTP 400 so the front knows the request is malformed and shouldn't be retried as-is
   * — distinct from 503 (provider hiccup, retry will likely work).
   */
  @ExceptionHandler(IllegalArgumentException::class)
  fun handleBadRequest(ex: IllegalArgumentException): ResponseEntity<Map<String, String>> =
    ResponseEntity.status(HttpStatus.BAD_REQUEST)
      .body(mapOf("error" to (ex.message ?: "Bad request")))

  /**
   * Any external upstream provider (Finnhub news/analyst/earnings, Twelve Data, Claude, Ollama)
   * rate-limited, unreachable, 5xx or auth-failed. Surfaced as HTTP 503 so the UI can differentiate
   * from a generic 500 and show "réessayez dans quelques minutes". The user-facing message stays
   * intentionally generic — the distinction "market vs LLM vs news" lives in the `detail` field
   * passed in from the throwing adapter.
   */
  @ExceptionHandler(UpstreamUnavailableException::class)
  fun handleUpstreamUnavailable(
    ex: UpstreamUnavailableException
  ): ResponseEntity<Map<String, String>> =
    ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
      .body(
        mapOf(
          "error" to "Données momentanément indisponibles",
          "detail" to (ex.message ?: "unavailable"),
        )
      )
}
