package com.portfolioai.tradingday.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.tradingday.application.dto.TradingDayDto
import com.portfolioai.tradingday.application.dto.TradingDayRequest
import com.portfolioai.tradingday.domain.TradingDay
import com.portfolioai.tradingday.infrastructure.persistence.TradingDayRepository
import java.time.Instant
import java.time.LocalDate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * The « nothing today » marks of the Today page (#407), scoped to the current user.
 *
 * The marks are stored as declared : whether a candidate or a trade entered afterwards overrides
 * them is read by the front, which already holds the day's data — so the record of the quiet days
 * stays what the user said, and the candidates / journal modules never have to know about it.
 */
@Service
class TradingDayService(
  private val repo: TradingDayRepository,
  private val authService: AuthService,
) {

  /** A day with nothing declared reads as two null marks, not a 404. */
  @Transactional(readOnly = true)
  fun get(date: LocalDate): TradingDayDto {
    val userId = authService.getCurrentUser().id
    return repo.findByUserIdAndTradingDate(userId, date)?.toDto() ?: TradingDayDto(date, null, null)
  }

  @Transactional
  fun put(date: LocalDate, request: TradingDayRequest): TradingDayDto {
    val user = authService.getCurrentUser()
    val existing = repo.findByUserIdAndTradingDate(user.id, date)
    if (!request.noCandidate && !request.noTrade) {
      existing?.let { repo.delete(it) }
      return TradingDayDto(date, null, null)
    }
    val now = Instant.now()
    val day = existing ?: TradingDay(user = user, tradingDate = date)
    day.noCandidateAt = if (request.noCandidate) day.noCandidateAt ?: now else null
    day.noTradeAt = if (request.noTrade) day.noTradeAt ?: now else null
    day.updatedAt = now
    return repo.save(day).toDto()
  }

  private fun TradingDay.toDto() = TradingDayDto(tradingDate, noCandidateAt, noTradeAt)
}
