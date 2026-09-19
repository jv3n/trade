package com.portfolioai.shared

/**
 * Raised when an upstream provider cannot serve the request : rate-limited, temporary 5xx,
 * unreachable, or auth-failed. Mapped to HTTP 503 by [GlobalExceptionHandler] so the UI can show a
 * "try again later" message rather than a generic 500.
 *
 * **Shared across bounded contexts.** Lives in `shared/` because the same 503 contract applies to
 * every external integration (today only the Frankfurter FX rate, in `forex/`). One exception with
 * one handler, rather than a `<Context>UnavailableException` per module that other modules would
 * end up importing.
 *
 * Distinct from [NoSuchElementException], which is used when the requested resource simply doesn't
 * exist — that one maps to HTTP 404.
 */
class UpstreamUnavailableException(message: String, cause: Throwable? = null) :
  RuntimeException(message, cause)
