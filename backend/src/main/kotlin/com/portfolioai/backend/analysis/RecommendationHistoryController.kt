package com.portfolioai.backend.analysis

import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/recommendations")
class RecommendationHistoryController(
    private val recommendationRepository: RecommendationRepository,
) {
    @GetMapping
    @Transactional(readOnly = true)
    fun getAllRecommendations(): List<RecommendationDto> =
        recommendationRepository.findAllOrderByGeneratedAtDesc().map { it.toDto() }
}
