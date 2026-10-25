package com.portfolioai.scanner.domain

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
 * One run of ts-scanner over [tradingDate] (#763), as the scanner reports it. It belongs to the
 * scanner's owner, whose Today page reads the latest one. A null [finishedAt] is a run cut short ;
 * [error] says why it failed.
 */
@Entity
@Table(name = "scanner_run")
class ScannerRun(
  @Id val id: UUID = UUID.randomUUID(),
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,
  @Column(name = "trading_date", nullable = false) val tradingDate: LocalDate,
  @Column(name = "started_at", nullable = false) val startedAt: Instant,
  @Column(name = "finished_at") val finishedAt: Instant? = null,
  @Column(name = "tickers_scanned", nullable = false) val tickersScanned: Int,
  @Column(name = "gus_found", nullable = false) val gusFound: Int,
  @Column(name = "dt_found", nullable = false) val dtFound: Int,
  @Column(length = 2000) val error: String? = null,
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
)
