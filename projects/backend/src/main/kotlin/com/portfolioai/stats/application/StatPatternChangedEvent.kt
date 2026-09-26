package com.portfolioai.stats.application

import com.portfolioai.shared.Pattern
import java.util.UUID

/**
 * Published by [StatEntryService] when a stat's pattern is changed after the fact (#393) — a ticker
 * filed as GUS that turned out to be a short into resistance ; never to or from DT, a double top is
 * a stat of its own (#434). The `journal` context moves the trade born from that stat onto the new
 * pattern : a filing correction, not a different decision. Consumed synchronously, in the same
 * transaction, so the stat and its trade never disagree.
 */
data class StatPatternChangedEvent(val statEntryId: UUID, val userId: UUID, val pattern: Pattern)
