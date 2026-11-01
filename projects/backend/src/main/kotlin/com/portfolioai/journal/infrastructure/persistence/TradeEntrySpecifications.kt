package com.portfolioai.journal.infrastructure.persistence

import com.portfolioai.journal.domain.EntryTiming
import com.portfolioai.journal.domain.ExecutionKind
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradeEntryFilter
import com.portfolioai.journal.domain.TradeExecution
import com.portfolioai.journal.domain.TradeStatus
import jakarta.persistence.criteria.CriteriaBuilder
import jakarta.persistence.criteria.CriteriaQuery
import jakarta.persistence.criteria.Predicate
import jakarta.persistence.criteria.Root
import jakarta.persistence.criteria.Subquery
import java.math.BigDecimal
import java.time.LocalTime
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
    Specification { root, query, cb ->
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
            // `exit_price` is set from the first cover : a partial position has one too.
            TradeStatus.CLOSED ->
              cb.and(
                cb.isNotNull(root.get<Any>("exitPrice")),
                cb.equal(cb.coalesce(sharesHeld(root, query, cb), 0L), 0L),
              )
            TradeStatus.PROFITABLE -> cb.greaterThan(retainedProfit, BigDecimal.ZERO)
            TradeStatus.LOSING -> cb.lessThan(retainedProfit, BigDecimal.ZERO)
          }
      }

      filter.entry?.let { timing ->
        // `TradeEntry.firstEntryAt` in SQL (#651) : the earliest timed ENTRY fill. No timed entry
        // gives NULL, which neither comparison lets through — an unknown time is on no side.
        val firstEntry = query.subquery(LocalTime::class.java)
        val fill = firstEntry.from(TradeExecution::class.java)
        val executedAt = fill.get<LocalTime>("executedAt")
        firstEntry
          .select(cb.least(executedAt))
          .where(
            cb.equal(fill.get<TradeEntry>("tradeEntry"), root),
            cb.equal(fill.get<ExecutionKind>("kind"), ExecutionKind.ENTRY),
            cb.isNotNull(executedAt),
          )
        predicates +=
          when (timing) {
            EntryTiming.AFTER_11 -> cb.greaterThanOrEqualTo(firstEntry, TradeEntry.LATE_ENTRY)
            EntryTiming.BEFORE_11 -> cb.lessThan(firstEntry, TradeEntry.LATE_ENTRY)
          }
      }

      cb.and(*predicates.toTypedArray())
    }

  private fun sharesHeld(
    root: Root<TradeEntry>,
    query: CriteriaQuery<*>,
    cb: CriteriaBuilder,
  ): Subquery<Long> {
    val held = query.subquery(Long::class.javaObjectType)
    val fill = held.from(TradeExecution::class.java)
    val shares = fill.get<Int>("shares")
    val signed =
      cb
        .selectCase<Int>()
        .`when`(cb.equal(fill.get<ExecutionKind>("kind"), ExecutionKind.ENTRY), shares)
        .otherwise(cb.neg(shares))
    return held
      .select(cb.sumAsLong(signed))
      .where(cb.equal(fill.get<TradeEntry>("tradeEntry"), root))
  }
}
