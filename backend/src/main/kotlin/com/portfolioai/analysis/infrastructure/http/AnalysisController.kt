package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.AnalysisJobStore
import com.portfolioai.analysis.application.AnalysisService
import com.portfolioai.analysis.application.dto.AnalysisJobDto
import com.portfolioai.analysis.application.dto.RecommendationDto
import com.portfolioai.analysis.application.dto.toDto
import com.portfolioai.analysis.infrastructure.persistence.RecommendationRepository
import java.util.UUID
import org.springframework.data.repository.findByIdOrNull
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/portfolios/{portfolioId}/recommendations")
class AnalysisController(
  private val analysisService: AnalysisService,
  private val recommendationRepository: RecommendationRepository,
  private val jobStore: AnalysisJobStore,
) {
  @PostMapping
  @ResponseStatus(HttpStatus.ACCEPTED)
  fun startAnalysis(@PathVariable portfolioId: UUID): AnalysisJobDto =
    analysisService.startAsync(portfolioId).toDto()

  @GetMapping("/jobs/{jobId}")
  fun getJobStatus(@PathVariable portfolioId: UUID, @PathVariable jobId: UUID): AnalysisJobDto =
    jobStore.get(jobId)?.toDto() ?: throw NoSuchElementException("Job $jobId not found")

  @GetMapping("/{recommendationId}")
  @Transactional(readOnly = true)
  fun getRecommendation(
    @PathVariable portfolioId: UUID,
    @PathVariable recommendationId: UUID,
  ): RecommendationDto =
    recommendationRepository.findByIdOrNull(recommendationId)?.toDto()
      ?: throw NoSuchElementException("Recommendation $recommendationId not found")

  @GetMapping
  @Transactional(readOnly = true)
  fun getRecommendations(@PathVariable portfolioId: UUID): List<RecommendationDto> =
    recommendationRepository.findByPortfolioId(portfolioId).map { it.toDto() }
}
