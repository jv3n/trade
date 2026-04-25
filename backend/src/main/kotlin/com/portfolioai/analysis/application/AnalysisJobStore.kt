package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.AnalysisJob
import com.portfolioai.analysis.domain.JobStatus
import org.springframework.stereotype.Component
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@Component
class AnalysisJobStore {
    private val jobs = ConcurrentHashMap<UUID, AnalysisJob>()

    fun create(): AnalysisJob {
        val job = AnalysisJob()
        jobs[job.id] = job
        return job
    }

    fun get(id: UUID): AnalysisJob? = jobs[id]

    fun complete(id: UUID, recommendationId: UUID) {
        jobs[id]?.let { it.status = JobStatus.DONE; it.recommendationId = recommendationId }
    }

    fun fail(id: UUID, error: String) {
        jobs[id]?.let { it.status = JobStatus.ERROR; it.error = error }
    }
}
