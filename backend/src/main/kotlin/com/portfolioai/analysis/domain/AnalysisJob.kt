package com.portfolioai.analysis.domain

import java.util.UUID

enum class JobStatus { PENDING, DONE, ERROR }

data class AnalysisJob(
    val id: UUID = UUID.randomUUID(),
    var status: JobStatus = JobStatus.PENDING,
    var recommendationId: UUID? = null,
    var error: String? = null,
)
