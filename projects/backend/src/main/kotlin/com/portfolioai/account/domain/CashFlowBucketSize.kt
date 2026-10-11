package com.portfolioai.account.domain

import java.time.LocalDate

/**
 * The width of one bar of the cash-flow report (#685). [unit] is the Postgres `date_trunc` field,
 * so a week starts on Monday (ISO), a quarter on January, April, July or October and a year on
 * January ; [interval] the step between two bars — Postgres has no `quarter` interval, hence three
 * months.
 */
enum class CashFlowBucketSize(val unit: String, val interval: String) {
  DAY("day", "1 day"),
  WEEK("week", "1 week"),
  MONTH("month", "1 month"),
  QUARTER("quarter", "3 months"),
  YEAR("year", "1 year");

  /** The first day of the bucket that follows the one starting on [start]. */
  fun next(start: LocalDate): LocalDate =
    when (this) {
      DAY -> start.plusDays(1)
      WEEK -> start.plusWeeks(1)
      MONTH -> start.plusMonths(1)
      QUARTER -> start.plusMonths(3)
      YEAR -> start.plusYears(1)
    }
}
