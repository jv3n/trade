package com.portfolioai.tradingday.domain

import com.portfolioai.auth.domain.User
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * What the user declared about a trading day on the Today page (#407) : nothing on the radar worth
 * a candidate, no trade. One row per (user, [tradingDate]) — `ux_trading_day_user_date`. A mark is
 * the instant it was set, null when absent ; the row is deleted once neither is left.
 */
@Entity
@Table(name = "trading_day")
class TradingDay(
  @Id val id: UUID = UUID.randomUUID(),
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,
  @Column(name = "trading_date", nullable = false) val tradingDate: LocalDate,
  @Column(name = "no_candidate_at") var noCandidateAt: Instant? = null,
  @Column(name = "no_trade_at") var noTradeAt: Instant? = null,
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
