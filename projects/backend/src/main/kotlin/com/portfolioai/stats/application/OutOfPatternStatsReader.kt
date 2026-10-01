package com.portfolioai.stats.application

import com.portfolioai.journal.domain.OutOfPatternStats
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * The journal's [OutOfPatternStats], read off
 * [com.portfolioai.stats.domain.StatEntry.outOfPattern].
 */
@Service
class OutOfPatternStatsReader(private val repo: StatEntryRepository) : OutOfPatternStats {

  @Transactional(readOnly = true)
  override fun among(statIds: Collection<UUID>): Set<UUID> =
    if (statIds.isEmpty()) emptySet()
    else repo.findAllById(statIds).filter { it.outOfPattern.isNotEmpty() }.map { it.id }.toSet()
}
