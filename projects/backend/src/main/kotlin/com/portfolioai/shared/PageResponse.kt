package com.portfolioai.shared

import org.springframework.data.domain.Page

/**
 * The JSON envelope of every paged listing. Ours rather than Spring Data's `PageImpl`, whose
 * serialized shape Spring does not commit to (#591) — the fields are the flat ones the frontend's
 * paged readers have always read. `number` is the zero-based page index.
 */
data class PageResponse<T : Any>(
  val content: List<T>,
  val number: Int,
  val size: Int,
  val totalElements: Long,
  val totalPages: Int,
)

fun <T : Any> Page<T>.toPageResponse(): PageResponse<T> =
  PageResponse(
    content = content,
    number = number,
    size = size,
    totalElements = totalElements,
    totalPages = totalPages,
  )
