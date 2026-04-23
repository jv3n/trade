package com.portfolioai.backend.analysis

import org.springframework.stereotype.Component
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

enum class JobStatus { PENDING, DONE, ERROR }

data class AnalysisJob(
    val id: UUID = UUID.randomUUID(),
    var status: JobStatus = JobStatus.PENDING,
    var recommendationId: UUID? = null,
    var error: String? = null,
)

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
