package com.portfolioai.analysis.application

import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Component

@Component
class AnalysisRunner(
  private val executor: AnalysisExecutor,
  private val jobStore: AnalysisJobStore,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Async
  fun run(portfolioId: UUID, jobId: UUID) {
    try {
      val recommendation = executor.execute(portfolioId)
      jobStore.complete(jobId, recommendation.id)
    } catch (e: Exception) {
      log.error("Analysis job {} failed: {}", jobId, e.message)
      jobStore.fail(jobId, e.message ?: "Unknown error")
    }
  }
}
