package com.portfolioai.journal.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * The single, optional screenshot attached to a [TradeEntry] (issue #110). Kept in its own table so
 * the [content] bytes are never loaded by the journal listing (which never joins here) — the
 * `trade_entry.has_screenshot` flag carries presence for the DTO instead. The image is served /
 * removed through dedicated endpoints ; it is intentionally out of the CSV flow.
 *
 * One row per trade (`trade_entry_id` UNIQUE). Cascade-deleted with its parent via the FK.
 */
@Entity
@Table(name = "trade_attachment")
class TradeAttachment(
  @Id val id: UUID = UUID.randomUUID(),

  /** Owning position. UNIQUE FK, `ON DELETE CASCADE` at the DB level. */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "trade_entry_id", nullable = false, unique = true)
  var tradeEntry: TradeEntry,
  @Column(nullable = false) var content: ByteArray,
  @Column(name = "content_type", nullable = false, length = 100) var contentType: String,
  @Column(length = 255) var filename: String? = null,
  @Column(name = "size_bytes", nullable = false) var sizeBytes: Int,
  @Column(name = "created_at", nullable = false, updatable = false)
  val createdAt: Instant = Instant.now(),
)
