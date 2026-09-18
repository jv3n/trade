package com.portfolioai.stats.domain

/**
 * How a [StatEntry] row entered the dataset.
 *
 * - [IMPORT] — the ADMIN CSV import (`POST /api/stats/import`). The curated, complete, **global**
 *   community rows : `createdBy` is null and every user can read them (arrives end of month).
 * - [RADAR] — a user pressed « Add stat » on the market radar. A partial row (only ticker / gap /
 *   open are known at scan time) owned by its creator.
 * - [MANUAL] — a user typed a row by hand in the stats « Add » dialog (can carry the full setup +
 *   outcome). Owned by its creator.
 *
 * [RADAR] and [MANUAL] are owned (`createdBy` set) and visible only to their creator alongside the
 * global IMPORT rows ; they are the only rows the owner may edit / delete. Uniqueness is per owner
 * : one analysis per (day, ticker, owner), so a user's own row and the community IMPORT row for the
 * same day/ticker coexist.
 */
enum class StatSource {
  IMPORT,
  RADAR,
  MANUAL,
}
