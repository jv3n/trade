package com.portfolioai.journal.infrastructure.persistence

import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradeEntryFilter
import com.portfolioai.journal.domain.TradeStatus
import jakarta.persistence.criteria.Predicate
import java.math.BigDecimal
import java.util.UUID
import org.springframework.data.jpa.domain.Specification

/**
 * Builds a [Specification] that combines the mandatory user-scope predicate with every optional
 * filter from [TradeEntryFilter]. Used by [TradeEntryService.findAll] via
 * [TradeEntryRepository.findAll]. Filtering happens at the SQL layer — no in-memory passes, no
 * loading the whole journal to discard rows.
 */
object TradeEntrySpecifications {

  fun matching(userId: UUID, filter: TradeEntryFilter): Specification<TradeEntry> =
    Specification { root, _, cb ->
      val predicates = mutableListOf<Predicate>()

      // Mandatory tenant scope — every query has it. Match against the FK column, not the
      // joined entity, to avoid an unnecessary JOIN.
      predicates += cb.equal(root.get<UUID>("user").get<UUID>("id"), userId)

      filter.query
        ?.takeIf { it.isNotBlank() }
        ?.let { q -> predicates += cb.like(cb.lower(root.get("ticker")), "%${q.lowercase()}%") }

      filter.dateFrom?.let { from ->
        predicates += cb.greaterThanOrEqualTo(root.get("tradeDate"), from)
      }
      filter.dateTo?.let { to -> predicates += cb.lessThanOrEqualTo(root.get("tradeDate"), to) }

      filter.plays
        ?.takeIf { it.isNotEmpty() }
        ?.let { plays -> predicates += root.get<Any>("play").`in`(plays) }
      filter.patterns
        ?.takeIf { it.isNotEmpty() }
        ?.let { patterns -> predicates += root.get<Any>("pattern").`in`(patterns) }

      filter.status?.let { status ->
        predicates +=
          when (status) {
            TradeStatus.OPEN -> cb.isNull(root.get<Any>("exitPrice"))
            TradeStatus.CLOSED -> cb.isNotNull(root.get<Any>("exitPrice"))
            TradeStatus.PROFITABLE -> cb.greaterThan(root.get("profitDollars"), BigDecimal.ZERO)
            TradeStatus.LOSING -> cb.lessThan(root.get("profitDollars"), BigDecimal.ZERO)
          }
      }

      cb.and(*predicates.toTypedArray())
    }
}
