package com.portfolioai.stats.infrastructure.http

import com.portfolioai.shared.Pattern
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.domain.StatStatus
import java.time.LocalDate
import org.springframework.format.annotation.DateTimeFormat

/**
 * The listing's and the summary's filter as query parameters (`?q=…&dateFrom=…&pattern=GUS`), every
 * one optional — bound by Spring from the request, one field per parameter.
 */
data class StatListingQuery(
  val q: String? = null,
  @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) val dateFrom: LocalDate? = null,
  @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) val dateTo: LocalDate? = null,
  val pattern: Pattern? = null,
  val status: StatStatus? = null,
  val noPush: Boolean? = null,
  val outOfPattern: Boolean? = null,
  val under1Dollar: Boolean? = null,
) {
  fun toFilter() =
    StatEntryFilter(
      query = q,
      dateFrom = dateFrom,
      dateTo = dateTo,
      pattern = pattern,
      status = status,
      noPush = noPush,
      outOfPattern = outOfPattern,
      under1Dollar = under1Dollar,
    )
}
