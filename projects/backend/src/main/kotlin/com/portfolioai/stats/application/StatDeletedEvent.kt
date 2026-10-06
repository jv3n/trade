package com.portfolioai.stats.application

import java.util.UUID

/**
 * Published by [StatEntryService] just before a stat is deleted (#635). The `journal` context
 * unlinks the trades born from it : they stay, with their executions, P&L, pattern and account
 * line, and become trades on their own. Consumed synchronously, in the same transaction, so the
 * stat never goes without its trades being unlinked first.
 */
data class StatDeletedEvent(val statEntryId: UUID, val userId: UUID)
