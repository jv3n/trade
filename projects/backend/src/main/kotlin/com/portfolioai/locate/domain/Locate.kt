package com.portfolioai.locate.domain

import com.portfolioai.auth.domain.User
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * Shares located before a short (#602) — billed per share whether or not the trade happens, so the
 * locate stands on its own : a cost on a (day, ticker), matched to the trades of that day by
 * ticker, never by a link (#625).
 */
@Entity
@Table(name = "locate")
class Locate(
  @Id val id: UUID = UUID.randomUUID(),
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,
  @Column(name = "trading_date", nullable = false) val tradingDate: LocalDate,
  @Column(name = "ticker", nullable = false, length = 20) val ticker: String,
  @Column(name = "shares", nullable = false) var shares: Int,
  @Column(name = "price_per_share", nullable = false, precision = 10, scale = 4)
  var pricePerShare: BigDecimal,
  /** The share's price when the locate was taken — what the locate is weighed against. */
  @Column(name = "stock_price", precision = 18, scale = 4) var stockPrice: BigDecimal? = null,
  @Column(name = "note", length = 2000) var note: String? = null,
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
) {
  /** What the broker charged : the locate is billed per share, with no minimum. */
  val cost: BigDecimal
    get() = pricePerShare.multiply(BigDecimal(shares)).setScale(2, RoundingMode.HALF_UP)
}
