package com.portfolioai.backend.analysis

import org.springframework.data.repository.findByIdOrNull
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class RecommendationActionDto(
    val ticker: String,
    val action: RecommendationAction,
    val rationale: String?,
    val targetWeight: BigDecimal?,
)

data class RecommendationDto(
    val id: UUID,
    val portfolioId: UUID,
    val portfolioName: String,
    val generatedAt: Instant,
    val contextSummary: String,
    val promptVersion: String,
    val content: String,
    val confidence: Short?,
    val status: RecommendationStatus,
    val actions: List<RecommendationActionDto>,
)

data class AnalysisJobDto(
    val jobId: UUID,
    val status: JobStatus,
    val recommendationId: UUID? = null,
    val error: String? = null,
)

fun Recommendation.toDto() = RecommendationDto(
    id = id,
    portfolioId = portfolio.id,
    portfolioName = portfolio.name,
    generatedAt = generatedAt,
    contextSummary = contextSummary,
    promptVersion = promptVersion,
    content = content,
    confidence = confidence,
    status = status,
    actions = actions.map { RecommendationActionDto(it.ticker, it.action, it.rationale, it.targetWeight) },
)

fun AnalysisJob.toDto() = AnalysisJobDto(jobId = id, status = status, recommendationId = recommendationId, error = error)

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
        jobStore.get(jobId)?.toDto()
            ?: throw NoSuchElementException("Job $jobId not found")

    @GetMapping("/{recommendationId}")
    @Transactional(readOnly = true)
    fun getRecommendation(@PathVariable portfolioId: UUID, @PathVariable recommendationId: UUID): RecommendationDto =
        recommendationRepository.findByIdOrNull(recommendationId)?.toDto()
            ?: throw NoSuchElementException("Recommendation $recommendationId not found")

    @GetMapping
    @Transactional(readOnly = true)
    fun getRecommendations(@PathVariable portfolioId: UUID): List<RecommendationDto> =
        recommendationRepository.findByPortfolioId(portfolioId).map { it.toDto() }
}
