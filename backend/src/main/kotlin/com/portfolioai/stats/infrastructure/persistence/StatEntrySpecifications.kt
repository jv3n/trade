package com.portfolioai.stats.infrastructure.persistence

import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatEntryFilter
import jakarta.persistence.criteria.Predicate
import java.util.UUID
import org.springframework.data.jpa.domain.Specification

/**
 * Builds a [Specification] combining the mandatory per-user **visibility** predicate with every
 * optional filter from [StatEntryFilter]. Mirrors `journal/.../TradeEntrySpecifications.kt` — all
 * filtering happens at the SQL layer (no in-memory passes).
 *
 * Visibility = the global/admin curated rows (`created_by IS NULL`) **plus** the caller's own rows
 * (`created_by = :userId`). A user never sees another user's RADAR/MANUAL rows.
 */
object StatEntrySpecifications {

  fun matching(userId: UUID, filter: StatEntryFilter): Specification<StatEntry> =
    Specification { root, _, cb ->
      val predicates = mutableListOf<Predicate>()

      // Mandatory visibility scope — global rows (created_by NULL) OR the caller's own.
      predicates +=
        cb.or(cb.isNull(root.get<UUID>("createdBy")), cb.equal(root.get<UUID>("createdBy"), userId))

      filter.query
        ?.takeIf { it.isNotBlank() }
        ?.let { q -> predicates += cb.like(cb.lower(root.get("ticker")), "%${q.lowercase()}%") }

      filter.dateFrom?.let { from ->
        predicates += cb.greaterThanOrEqualTo(root.get("tradeDate"), from)
      }
      filter.dateTo?.let { to -> predicates += cb.lessThanOrEqualTo(root.get("tradeDate"), to) }

      filter.source?.let { source -> predicates += cb.equal(root.get<Any>("source"), source) }

      filter.gapMin?.let { min ->
        predicates += cb.greaterThanOrEqualTo(root.get("gapUpPercent"), min)
      }
      filter.gapMax?.let { max ->
        predicates += cb.lessThanOrEqualTo(root.get("gapUpPercent"), max)
      }

      cb.and(*predicates.toTypedArray())
    }
}
