package com.portfolioai.candidates.application

import com.portfolioai.candidates.infrastructure.persistence.CandidateRepository
import com.portfolioai.stats.domain.CandidatePremarket
import com.portfolioai.stats.domain.Premarket
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** The stats' [CandidatePremarket], read off the candidate as captured. */
@Service
class CandidatePremarketReader(private val repo: CandidateRepository) : CandidatePremarket {

  @Transactional(readOnly = true)
  override fun of(candidateId: UUID, userId: UUID): Premarket? =
    repo.findByIdAndUserId(candidateId, userId)?.let {
      Premarket(it.previousClose, it.pmOpen, it.pmHigh)
    }
}
