package com.portfolioai.account.infrastructure.persistence

import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.domain.CashFlowBucket
import com.portfolioai.account.domain.CashFlowBucketSize
import java.time.LocalDate
import java.util.UUID
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository

/**
 * The cash-flow report's aggregate, in SQL rather than over every movement pulled into Kotlin : it
 * is the query that grows with every trade. Native through JDBC because a JPQL predicate on the
 * movement type makes Hibernate cast to a type Postgres does not have (see `AccountService`).
 */
@Repository
class AccountCashFlowQuery(private val jdbc: NamedParameterJdbcTemplate) {

  /**
   * One row per bucket from the one holding [from] to the one holding [to], empty buckets included,
   * each summing the user's movements of [types] dated within [from]..[to].
   */
  fun buckets(
    userId: UUID,
    from: LocalDate,
    to: LocalDate,
    size: CashFlowBucketSize,
    types: Collection<AccountMovementType>,
  ): List<CashFlowBucket> =
    jdbc.query(
      SQL,
      mapOf(
        "userId" to userId,
        "from" to from,
        "to" to to,
        "unit" to size.unit,
        "step" to size.interval,
        "types" to types.map { it.name },
      ),
    ) { rs, _ ->
      CashFlowBucket(
        start = rs.getObject("bucket_start", LocalDate::class.java),
        winningTrades = rs.getBigDecimal("winning_trades"),
        losingTrades = rs.getBigDecimal("losing_trades"),
        locates = rs.getBigDecimal("locates"),
        deposits = rs.getBigDecimal("deposits"),
        withdrawals = rs.getBigDecimal("withdrawals"),
        adjustments = rs.getBigDecimal("adjustments"),
      )
    }

  private companion object {
    // `date_trunc` on a `timestamp`, not a `date` : the date overload goes through `timestamptz`
    // and would shift the bucket with the session's time zone.
    const val SQL =
      """
      WITH buckets AS (
        SELECT CAST(gs AS date) AS bucket_start
        FROM generate_series(
          date_trunc(:unit, CAST(:from AS timestamp)),
          CAST(:to AS timestamp),
          CAST(:step AS interval)
        ) AS gs
      ),
      sums AS (
        SELECT CAST(date_trunc(:unit, CAST(m.value_date AS timestamp)) AS date) AS bucket_start,
               SUM(m.amount) FILTER (WHERE m.type = 'TRADE' AND m.amount > 0) AS winning_trades,
               SUM(m.amount) FILTER (WHERE m.type = 'TRADE' AND m.amount < 0) AS losing_trades,
               SUM(m.amount) FILTER (WHERE m.type = 'LOCATE') AS locates,
               SUM(m.amount) FILTER (WHERE m.type = 'DEPOSIT') AS deposits,
               SUM(m.amount) FILTER (WHERE m.type = 'WITHDRAWAL') AS withdrawals,
               SUM(m.amount) FILTER (WHERE m.type = 'ADJUSTMENT') AS adjustments
        FROM account_movement m
        WHERE m.user_id = :userId
          AND m.value_date BETWEEN :from AND :to
          AND CAST(m.type AS text) IN (:types)
        GROUP BY 1
      )
      SELECT b.bucket_start,
             COALESCE(s.winning_trades, 0) AS winning_trades,
             COALESCE(s.losing_trades, 0) AS losing_trades,
             COALESCE(s.locates, 0) AS locates,
             COALESCE(s.deposits, 0) AS deposits,
             COALESCE(s.withdrawals, 0) AS withdrawals,
             COALESCE(s.adjustments, 0) AS adjustments
      FROM buckets b
      LEFT JOIN sums s ON s.bucket_start = b.bucket_start
      ORDER BY b.bucket_start
      """
  }
}
