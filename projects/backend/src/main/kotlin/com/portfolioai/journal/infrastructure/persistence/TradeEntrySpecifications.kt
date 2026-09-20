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

      filter.patterns
        ?.takeIf { it.isNotEmpty() }
        ?.let { patterns -> predicates += root.get<Any>("pattern").`in`(patterns) }

      filter.status?.let { status ->
        // PROFITABLE / LOSING read the **retained** P&L — COALESCE(real, computed) — so a trade
        // whose broker statement turned a computed gain into a net loss (fees) lands in the right
        // bucket. Same rule as `TradeEntry.retainedProfit`, expressed in SQL (#192).
        val retainedProfit =
          cb.coalesce(
            root.get<BigDecimal>("realProfitDollars"),
            root.get<BigDecimal>("profitDollars"),
          )
        predicates +=
          when (status) {
            TradeStatus.OPEN -> cb.isNull(root.get<Any>("exitPrice"))
            TradeStatus.CLOSED -> cb.isNotNull(root.get<Any>("exitPrice"))
            TradeStatus.PROFITABLE -> cb.greaterThan(retainedProfit, BigDecimal.ZERO)
            TradeStatus.LOSING -> cb.lessThan(retainedProfit, BigDecimal.ZERO)
          }
      }

      cb.and(*predicates.toTypedArray())
    }
}
