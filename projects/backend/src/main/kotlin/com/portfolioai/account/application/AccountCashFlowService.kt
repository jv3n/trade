package com.portfolioai.account.application

import com.portfolioai.account.application.dto.CashFlowDto
import com.portfolioai.account.application.dto.toDto
import com.portfolioai.account.domain.AccountMovementFilter
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.domain.CashFlowBucketSize
import com.portfolioai.account.infrastructure.persistence.AccountCashFlowQuery
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.auth.application.AuthService
import com.portfolioai.shared.badRequest
import java.time.LocalDate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * The « Flux du compte » report (#685) : what went in and out of the account, bucket by bucket,
 * with the balance on either side of the period. Reads the ledger as it stands — nothing here is
 * recorded.
 */
@Service
class AccountCashFlowService(
  private val query: AccountCashFlowQuery,
  private val repo: AccountMovementRepository,
  private val authService: AuthService,
) {

  /**
   * The buckets of [size] over the filtered period. An open bound falls back to the user's first or
   * last movement, so « all time » starts where the account does ; an account with nothing in the
   * window answers no bucket at all.
   */
  @Transactional(readOnly = true)
  fun cashFlow(filter: AccountMovementFilter, size: CashFlowBucketSize): CashFlowDto {
    val dateFrom = filter.dateFrom
    val dateTo = filter.dateTo
    if (dateFrom != null && dateTo != null && dateFrom.isAfter(dateTo)) {
      throw badRequest("dateFrom must not be after dateTo")
    }
    val userId = authService.getCurrentUser().id
    val from = dateFrom ?: repo.firstValueDate(userId)
    val to = dateTo ?: repo.lastValueDate(userId)
    if (from == null || to == null || from.isAfter(to)) {
      val balance = repo.balanceFor(userId)
      return CashFlowDto(dateFrom, dateTo, balance, balance, emptyList())
    }
    if (bucketCount(from, to, size) > MAX_BUCKETS) {
      throw badRequest("More than $MAX_BUCKETS bars — pick a wider bucket for this period")
    }
    val types = filter.types?.takeIf { it.isNotEmpty() } ?: AccountMovementType.entries
    val buckets =
      query.buckets(userId, from, to, size, types).map { bucket ->
        bucket.toDto(
          from = maxOf(bucket.start, from),
          to = minOf(size.next(bucket.start).minusDays(1), to),
        )
      }
    return CashFlowDto(
      dateFrom = from,
      dateTo = to,
      openingBalance = repo.balanceAt(userId, from.minusDays(1)),
      closingBalance = repo.balanceAt(userId, to),
      buckets = buckets,
    )
  }

  private fun bucketCount(from: LocalDate, to: LocalDate, size: CashFlowBucketSize): Int =
    generateSequence(from) { size.next(it) }
      .takeWhile { !it.isAfter(to) }
      .take(MAX_BUCKETS + 1)
      .count()

  private companion object {
    /** A daily bar over a whole year fits ; daily bars over all time would not be read anyway. */
    const val MAX_BUCKETS = 400
  }
}
