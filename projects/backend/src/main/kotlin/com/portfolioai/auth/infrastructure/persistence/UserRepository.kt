package com.portfolioai.auth.infrastructure.persistence

import com.portfolioai.auth.domain.User
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface UserRepository : JpaRepository<User, UUID> {
  fun findByEmail(email: String): User?
}
