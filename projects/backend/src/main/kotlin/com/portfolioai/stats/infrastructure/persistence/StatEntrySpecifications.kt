package com.portfolioai.stats.infrastructure.persistence

import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.domain.StatStatus
import jakarta.persistence.criteria.Predicate
import java.util.UUID
import org.springframework.data.jpa.domain.Specification

/**
 * Builds a [Specification] combining the mandatory per-user scope with every optional filter from
 * [StatEntryFilter]. Mirrors `journal/.../TradeEntrySpecifications.kt` — all filtering happens at
 * the SQL layer (no in-memory passes).
 *
 * The completion status has no column : "completed" is expressed as *every session price is set*,
 * the same definition as `StatEntry.isCompleted`.
 */
object StatEntrySpecifications {

  /** Session columns that must all be set for a stat to count as completed. */
  private val SESSION_COLUMNS =
    listOf("openPrice", "pushOpenPrice", "hodPrice", "lodPrice", "eodPrice")

  fun matching(userId: UUID, filter: StatEntryFilter): Specification<StatEntry> =
    Specification { root, _, cb ->
      val predicates = mutableListOf<Predicate>()

      // Mandatory scope — the caller's own stats only.
      predicates += cb.equal(root.get<Any>("user").get<UUID>("id"), userId)

      filter.query
        ?.takeIf { it.isNotBlank() }
        ?.let { q -> predicates += cb.like(cb.lower(root.get("ticker")), "%${q.lowercase()}%") }

      filter.dateFrom?.let { from ->
        predicates += cb.greaterThanOrEqualTo(root.get("tradeDate"), from)
      }
      filter.dateTo?.let { to -> predicates += cb.lessThanOrEqualTo(root.get("tradeDate"), to) }

      filter.pattern?.let { pattern -> predicates += cb.equal(root.get<Any>("pattern"), pattern) }

      filter.status?.let { status ->
        val allSet = SESSION_COLUMNS.map { cb.isNotNull(root.get<Any>(it)) }
        predicates +=
          when (status) {
            StatStatus.COMPLETED -> cb.and(*allSet.toTypedArray())
            // To complete = at least one session price still missing.
            StatStatus.TO_COMPLETE -> cb.not(cb.and(*allSet.toTypedArray()))
          }
      }

      cb.and(*predicates.toTypedArray())
    }
}
