package com.portfolioai.analysis.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * Async job tracking one narrative generation request for a ticker. The frontend polls `GET
 * /narrative/jobs/{id}` until status is `DONE`, then reads the [snapshotId]-referenced snapshot.
 * Mirrors the `analysis_job` pattern — see [AnalysisJob].
 */
@Entity
@Table(name = "ticker_narrative_job")
class TickerNarrativeJob(
  @Id val id: UUID = UUID.randomUUID(),
  @Column(nullable = false, length = 20) val symbol: String,
  @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.now(),
  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 10)
  var status: JobStatus = JobStatus.PENDING,
  @Column(name = "snapshot_id") var snapshotId: UUID? = null,
  @Column(columnDefinition = "text") var error: String? = null,
)
