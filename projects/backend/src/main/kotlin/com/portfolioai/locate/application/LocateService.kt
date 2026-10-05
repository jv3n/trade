package com.portfolioai.locate.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.locate.application.dto.LocateDto
import com.portfolioai.locate.application.dto.LocateRequest
import com.portfolioai.locate.application.dto.LocateUpdateRequest
import com.portfolioai.locate.domain.Locate
import com.portfolioai.locate.infrastructure.persistence.LocateRepository
import com.portfolioai.shared.badRequest
import com.portfolioai.shared.requireNonNegative
import com.portfolioai.shared.requirePositive
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * The locates of the current user (#602) — shares located before a short, paid whether or not the
 * trade happens. Each change is published as a [LocateChangedEvent], for the account's `LOCATE`
 * movement. A locate is never cancelled : deleting one is fixing a typo.
 */
@Service
class LocateService(
  private val repo: LocateRepository,
  private val authService: AuthService,
  private val events: ApplicationEventPublisher,
) {

  /** The day's locates, oldest first — narrowed to one ticker when given (the trade sheet). */
  @Transactional(readOnly = true)
  fun listForDate(date: LocalDate, ticker: String?): List<LocateDto> {
    val userId = authService.getCurrentUser().id
    val rows =
      ticker?.let {
        repo.findByUserIdAndTradingDateAndTickerOrderByCreatedAt(userId, date, clean(it))
      } ?: repo.findByUserIdAndTradingDateOrderByCreatedAt(userId, date)
    return rows.map { it.toDto() }
  }

  @Transactional
  fun create(request: LocateRequest): LocateDto {
    val locate =
      Locate(
        user = authService.getCurrentUser(),
        tradingDate = request.tradingDate,
        ticker = clean(request.ticker),
        shares = requireShares(request.shares),
        pricePerShare = request.pricePerShare.requireNonNegative("Price per share"),
        stockPrice = request.stockPrice?.requirePositive("Stock price"),
        note = cleanNote(request.note),
      )
    val saved = repo.saveAndFlush(locate)
    publish(saved, deleted = false)
    return saved.toDto()
  }

  @Transactional
  fun update(id: UUID, request: LocateUpdateRequest): LocateDto {
    val locate = loadOwned(id)
    locate.shares = requireShares(request.shares)
    locate.pricePerShare = request.pricePerShare.requireNonNegative("Price per share")
    locate.stockPrice = request.stockPrice?.requirePositive("Stock price")
    locate.note = cleanNote(request.note)
    locate.updatedAt = Instant.now()
    val saved = repo.saveAndFlush(locate)
    publish(saved, deleted = false)
    return saved.toDto()
  }

  /** Published before the row goes : the account removes the movement first. */
  @Transactional
  fun delete(id: UUID) {
    val locate = loadOwned(id)
    publish(locate, deleted = true)
    repo.delete(locate)
  }

  private fun loadOwned(id: UUID): Locate {
    val userId = authService.getCurrentUser().id
    return repo.findByIdAndUserId(id, userId)
      ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Locate $id not found")
  }

  private fun publish(locate: Locate, deleted: Boolean) {
    events.publishEvent(
      LocateChangedEvent(
        locateId = locate.id,
        userId = locate.user.id,
        ticker = locate.ticker,
        tradingDate = locate.tradingDate,
        shares = locate.shares,
        cost = locate.cost,
        deleted = deleted,
      )
    )
  }

  private fun requireShares(shares: Int): Int =
    shares.takeIf { it > 0 } ?: throw badRequest("Shares located must be greater than zero")

  private fun clean(ticker: String): String =
    ticker.trim().uppercase().ifEmpty { throw badRequest("Ticker must not be blank") }

  private fun cleanNote(note: String?): String? = note?.trim()?.ifEmpty { null }

  private fun Locate.toDto() =
    LocateDto(
      id = id,
      tradingDate = tradingDate,
      ticker = ticker,
      shares = shares,
      pricePerShare = pricePerShare,
      stockPrice = stockPrice,
      cost = cost,
      note = note,
      createdAt = createdAt,
      updatedAt = updatedAt,
    )
}
