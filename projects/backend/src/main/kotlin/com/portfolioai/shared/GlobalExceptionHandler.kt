package com.portfolioai.shared

import java.sql.SQLException
import org.springframework.dao.DataIntegrityViolationException
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
   * A DB constraint refused the write. A unique or FK collision is a 409 : editing a stat row onto
   * a (day, ticker) the caller already owns hits `ux_stat_entry_day_ticker_owner`. A value that
   * doesn't fit — a number past its column, a check constraint — is the input's fault, so a 400.
   * The `detail` carries the constraint hint for debugging, not for the end user.
   */
  @ExceptionHandler(DataIntegrityViolationException::class)
  fun handleConflict(ex: DataIntegrityViolationException): ResponseEntity<Map<String, String>> =
    if ((ex.mostSpecificCause as? SQLException)?.sqlState in REFUSED_INPUT) {
      ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("error" to "Value out of range"))
    } else conflict(ex)

  private fun conflict(ex: DataIntegrityViolationException): ResponseEntity<Map<String, String>> =
    ResponseEntity.status(HttpStatus.CONFLICT)
      .body(
        mapOf(
          "error" to "Conflict : the resource already exists",
          "detail" to (ex.mostSpecificCause.message ?: "constraint violation"),
        )
      )

  /**
   * User-supplied parameter is invalid. Surfaced as HTTP 400 : the request is malformed and
   * shouldn't be retried as-is — distinct from 503 (upstream hiccup, retry will likely work).
   */
  @ExceptionHandler(IllegalArgumentException::class)
  fun handleBadRequest(ex: IllegalArgumentException): ResponseEntity<Map<String, String>> =
    ResponseEntity.status(HttpStatus.BAD_REQUEST)
      .body(mapOf("error" to (ex.message ?: "Bad request")))

  @ExceptionHandler(RefusedWriteException::class)
  fun handleRefusedWrite(ex: RefusedWriteException): ResponseEntity<Map<String, String>> =
    ResponseEntity.status(HttpStatus.BAD_REQUEST)
      .body(mapOf("error" to ex.message.orEmpty(), "code" to ex.code.name))

  /**
   * An external upstream service (today : the Frankfurter FX rate API) rate-limited, unreachable,
   * 5xx or auth-failed. Surfaced as HTTP 503 so the UI can differentiate from a generic 500 and
   * suggest trying again later. The user-facing message stays intentionally generic — which
   * upstream failed lives in the `detail` field passed in from the throwing adapter.
   */
  @ExceptionHandler(UpstreamUnavailableException::class)
  fun handleUpstreamUnavailable(
    ex: UpstreamUnavailableException
  ): ResponseEntity<Map<String, String>> =
    ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
      .body(
        mapOf("error" to "Data temporarily unavailable", "detail" to (ex.message ?: "unavailable"))
      )

  private companion object {
    /** PostgreSQL's numeric overflow and check violation. */
    val REFUSED_INPUT = setOf("22003", "23514")
  }
}
