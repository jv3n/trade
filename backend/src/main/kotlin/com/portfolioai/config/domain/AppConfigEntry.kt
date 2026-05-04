package com.portfolioai.config.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * One runtime config override. Maps 1:1 to `app_config` (V4).
 *
 * Absence of a row for a known key means "use the YAML default" — the table only stores explicit
 * overrides. Values are stored as TEXT regardless of logical type ; the [AppConfigService] parses
 * to Int / String at read time depending on the key.
 */
@Entity
@Table(name = "app_config")
class AppConfigEntry(
  @Id @Column(name = "config_key", length = 100) val configKey: String,
  @Column(name = "config_value", nullable = false, columnDefinition = "TEXT")
  var configValue: String,
  @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
