package com.portfolioai.news.infrastructure.news

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

/**
 * Jackson DTO mirroring Finnhub's `/company-news` response shape. The endpoint returns a flat JSON
 * array of news items — each item has the fields below plus a few extras (`related`, `image`'s
 * aspect ratio…) that we ignore.
 *
 * Reference : https://finnhub.io/docs/api/company-news
 *
 * Notable quirks :
 * - `id` is a long integer in the wire payload but we map to String — IDs are stable per provider
 *   but we'd rather not lock the domain to a numeric form (other providers may use UUIDs).
 * - `datetime` is a Unix timestamp **in seconds**, not millis. The mapper converts.
 * - `image` is `""` (empty string) when there's no thumbnail rather than absent — handled by the
 *   mapper which treats empty as `null`.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class FinnhubNewsItem(
  val id: Long,
  val category: String?,
  val datetime: Long,
  val headline: String,
  val image: String?,
  val source: String,
  val summary: String?,
  val url: String,
)
