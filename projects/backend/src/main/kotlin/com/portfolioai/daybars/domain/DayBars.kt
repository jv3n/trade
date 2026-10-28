package com.portfolioai.daybars.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

/** Whether the provider served a day's bars — names match the Postgres enum `day_bars_status`. */
enum class DayBarsStatus {
  FOUND,
  /** Nothing served (a delisted or renamed ticker) : the scanner does not ask again. */
  NOT_FOUND,
}

/**
 * The 1-min bars of [ticker] on [tradingDate] (#784), shared by every stat of that ticker-day and
 * every user. [bars] holds them encoded (`BarsCodec`), null when [status] is `NOT_FOUND`.
 */
@Entity
@Table(name = "day_bars")
class DayBars(
  @Id val id: UUID = UUID.randomUUID(),
  @Column(name = "trading_date", nullable = false) val tradingDate: LocalDate,
  @Column(nullable = false, length = 20) val ticker: String,
  @JdbcTypeCode(SqlTypes.NAMED_ENUM) @Column(nullable = false) var status: DayBarsStatus,
  @Column(name = "bars") var bars: ByteArray? = null,
  @Column(name = "bar_count", nullable = false) var barCount: Int = 0,
  @Column(name = "fetched_at", nullable = false) var fetchedAt: Instant = Instant.now(),
)
