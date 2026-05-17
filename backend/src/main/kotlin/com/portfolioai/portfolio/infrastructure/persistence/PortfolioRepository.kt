package com.portfolioai.portfolio.infrastructure.persistence

import com.portfolioai.portfolio.domain.Portfolio
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/**
 * Toutes les méthodes de lecture portent `ByUserId(...)` parce que la table `portfolio` est
 * multi-tenant (`user_id NOT NULL` + FK `app_user(id) ON DELETE CASCADE`, cf.
 * `db/migration/V1__init.sql`). Le `findByName` historique a aussi été scopé — un name dupliqué
 * entre deux users est légitime (alice et bob peuvent tous deux avoir un portfolio « TFSA »).
 */
interface PortfolioRepository : JpaRepository<Portfolio, UUID> {

  fun findAllByUserId(userId: UUID): List<Portfolio>

  fun findByIdAndUserId(id: UUID, userId: UUID): Portfolio?

  fun existsByIdAndUserId(id: UUID, userId: UUID): Boolean

  fun findByUserIdAndName(userId: UUID, name: String): Portfolio?
}
