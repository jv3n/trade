package com.portfolioai.stats.domain

/**
 * How a [StatEntry] row entered the dataset.
 *
 * - [IMPORT] — the ADMIN CSV import (`POST /api/stats/import`). These are the curated, complete,
 *   global rows : `createdBy` is null and every user can read them.
 * - [RADAR] — a user pressed « Add stat » on the market radar. A partial row (only ticker / gap /
 *   open price are known at scan time) owned by its creator (`createdBy` set) and visible only to
 *   them, alongside the global IMPORT rows.
 */
enum class StatSource {
  IMPORT,
  RADAR,
}
