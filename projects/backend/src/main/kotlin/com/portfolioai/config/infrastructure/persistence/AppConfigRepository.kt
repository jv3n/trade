package com.portfolioai.config.infrastructure.persistence

import com.portfolioai.config.domain.AppConfigEntry
import org.springframework.data.jpa.repository.JpaRepository

interface AppConfigRepository : JpaRepository<AppConfigEntry, String>
