package com.portfolioai.journal.infrastructure.persistence

import com.portfolioai.journal.domain.TradeAttachment
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/**
 * One attachment per trade (UNIQUE `trade_entry_id`). The service always scopes the trade to the
 * current user first (via `TradeEntryService.loadOwned`) before touching the attachment, so these
 * lookups don't re-carry the userId.
 */
interface TradeAttachmentRepository : JpaRepository<TradeAttachment, UUID> {

  fun findByTradeEntryId(tradeEntryId: UUID): TradeAttachment?

  fun deleteByTradeEntryId(tradeEntryId: UUID): Long
}
