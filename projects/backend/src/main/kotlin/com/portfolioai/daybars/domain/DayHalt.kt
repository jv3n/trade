package com.portfolioai.daybars.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * A halt of [ticker] on [tradingDate] (#829), read off its bars by [HaltReader] : [haltedAt] and
 * [reopenedAt] are the opening minutes of the bars either side of the gap.
 */
@Entity
@Table(name = "day_halt")
class DayHalt(
  @Id val id: UUID = UUID.randomUUID(),
  @Column(name = "trading_date", nullable = false) val tradingDate: LocalDate,
  @Column(nullable = false, length = 20) val ticker: String,
  @Column(name = "halted_at", nullable = false) val haltedAt: Instant,
  @Column(name = "reopened_at", nullable = false) val reopenedAt: Instant,
  @Column(name = "last_close", nullable = false) val lastClose: BigDecimal,
  @Column(name = "reopen_price", nullable = false) val reopenPrice: BigDecimal,
)
