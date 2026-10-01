package com.portfolioai.journal.domain

import java.util.UUID

/**
 * Port — which of these stats the recorded prices say were not the setup (#499), so the journal can
 * split its P&L in-rules / out-of-pattern. The rule belongs to the stats context, which implements
 * it ; a port rather than a call to its service, which already depends on the journal.
 */
fun interface OutOfPatternStats {
  fun among(statIds: Collection<UUID>): Set<UUID>
}
