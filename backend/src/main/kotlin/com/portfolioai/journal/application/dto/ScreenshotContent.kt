package com.portfolioai.journal.application.dto

/** Raw screenshot payload served back by the download endpoint (issue #110). */
data class ScreenshotContent(val bytes: ByteArray, val contentType: String)
