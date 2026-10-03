package com.portfolioai.journal.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.journal.application.dto.ScreenshotContent
import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.journal.application.dto.toDto
import com.portfolioai.journal.domain.TradeAttachment
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.infrastructure.persistence.TradeAttachmentRepository
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * A trade's screenshot (issue #110) — one optional image per trade, stored as bytea in
 * `trade_attachment`. Out of the CSV flow ; managed from the detail view once the trade exists.
 */
@Service
class TradeAttachmentService(
  private val repo: TradeEntryRepository,
  private val attachmentRepo: TradeAttachmentRepository,
  private val authService: AuthService,
) {

  /**
   * Attaches (or replaces) the trade's single screenshot. Validates the content type against
   * [ALLOWED_IMAGE_TYPES] and the size against [MAX_SCREENSHOT_BYTES] → HTTP 400 on violation. Sets
   * the denormalized [TradeEntry.hasScreenshot] flag so the listing DTO reflects presence without a
   * join.
   */
  @Transactional
  fun attachScreenshot(
    id: UUID,
    bytes: ByteArray,
    contentType: String?,
    filename: String?,
  ): TradeEntryDto {
    require(bytes.isNotEmpty()) { "Screenshot file is empty" }
    require(bytes.size <= MAX_SCREENSHOT_BYTES) {
      "Screenshot exceeds the ${MAX_SCREENSHOT_BYTES / BYTES_PER_MB} MB limit"
    }
    val normalizedType =
      requireNotNull(contentType?.lowercase()?.takeIf { it in ALLOWED_IMAGE_TYPES }) {
        "Unsupported image type '$contentType' — allowed: ${ALLOWED_IMAGE_TYPES.joinToString(", ")}"
      }

    val entry = loadOwned(id)
    val existing = attachmentRepo.findByTradeEntryId(entry.id)
    if (existing != null) {
      existing.content = bytes
      existing.contentType = normalizedType
      existing.filename = filename
      existing.sizeBytes = bytes.size
      attachmentRepo.save(existing)
    } else {
      attachmentRepo.save(
        TradeAttachment(
          tradeEntry = entry,
          content = bytes,
          contentType = normalizedType,
          filename = filename,
          sizeBytes = bytes.size,
        )
      )
    }
    entry.hasScreenshot = true
    entry.updatedAt = Instant.now()
    return repo.saveAndFlush(entry).toDto()
  }

  /** Returns the trade's screenshot bytes + content type, or 404 if none (or trade not owned). */
  @Transactional(readOnly = true)
  fun getScreenshot(id: UUID): ScreenshotContent {
    val entry = loadOwned(id)
    val attachment =
      attachmentRepo.findByTradeEntryId(entry.id)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "No screenshot for trade $id")
    return ScreenshotContent(bytes = attachment.content, contentType = attachment.contentType)
  }

  /** Removes the trade's screenshot (no-op-safe) and clears the [TradeEntry.hasScreenshot] flag. */
  @Transactional
  fun deleteScreenshot(id: UUID): TradeEntryDto {
    val entry = loadOwned(id)
    attachmentRepo.deleteByTradeEntryId(entry.id)
    entry.hasScreenshot = false
    entry.updatedAt = Instant.now()
    return repo.saveAndFlush(entry).toDto()
  }

  private fun loadOwned(id: UUID): TradeEntry {
    val userId = authService.getCurrentUser().id
    return repo.findByIdAndUserId(id, userId)
      ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Trade entry $id not found")
  }

  private companion object {
    /** Upload guardrails — enforced in-service (→ 400) before the DB. */
    val ALLOWED_IMAGE_TYPES = setOf("image/png", "image/jpeg", "image/webp")
    const val BYTES_PER_MB = 1024 * 1024
    const val MAX_SCREENSHOT_BYTES = 5 * BYTES_PER_MB
  }
}
