package com.portfolioai.analysis.infrastructure.persistence

import java.sql.Timestamp
import java.time.Instant

/**
 * Shared row-mapping helpers for native-SQL queries in `analysis/infrastructure/persistence`.
 *
 * Hibernate maps `TIMESTAMPTZ` columns to either [java.sql.Timestamp] or [java.time.Instant]
 * depending on the driver version (and sometimes on whether the column flows through a function
 * like `DATE_TRUNC` or a JOIN). Normalizing at the row-mapper boundary means every row type carries
 * a stable [Instant] regardless. The string fallback covers JDBC drivers that hand us a `String`
 * representation in edge cases — `Instant.parse` accepts the standard ISO-8601 shape.
 *
 * Lives at package level (no class) because it has no state ; [internal] keeps it scoped to this
 * package so callers outside `persistence` can't accidentally rely on the driver-flake quirk.
 */
internal fun normalizeInstant(value: Any?): Instant =
  when (value) {
    is Instant -> value
    is Timestamp -> value.toInstant()
    else -> Instant.parse(value.toString())
  }
