package com.portfolioai.shared

/**
 * Raised when an upstream provider cannot serve the request : rate-limited, temporary 5xx,
 * unreachable, or auth-failed. Mapped to HTTP 503 by [GlobalExceptionHandler] so the UI can show a
 * "try again later" message rather than a generic 500.
 *
 * **Shared across bounded contexts.** Lives in `shared/` because the same 503 contract applies to
 * every external integration in the project (Finnhub for news / analyst / earnings, Twelve Data for
 * market, Claude / Ollama for the LLM pipeline). Keeping a single exception in `shared/` avoids
 * duplicating the same `<Context>UnavailableException` four times with identical handlers, and
 * avoids the previous footgun where `MarketUnavailableException` lived in `market/domain/` and was
 * imported as an implicit cross-context dependency by `news/`, `analyst/`, `earnings/` (replaced
 * 2026-05-15 — see backlog dette ticket #B2).
 *
 * Distinct from [NoSuchElementException], which is used when the symbol simply doesn't exist on the
 * provider — that one maps to HTTP 404.
 */
class UpstreamUnavailableException(message: String, cause: Throwable? = null) :
  RuntimeException(message, cause)
