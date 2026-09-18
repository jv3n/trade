package com.portfolioai.auth.infrastructure.security

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import java.time.Instant
import org.springframework.boot.CommandLineRunner
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/**
 * Seeds the fake dev [User] on boot when the `local-no-auth` profile is active. Idempotent —
 * skipped if the row already exists, so a subsequent `tilt up` doesn't churn it.
 *
 * The seeded user is the principal that [LocalNoAuthFilter] injects into the security context on
 * every request. Email is fixed at [LocalNoAuthFilter.LOCAL_DEV_EMAIL] ; role is hard-coded to
 * ADMIN so the dev sees every section (settings, observability, prompts) without juggling roles. To
 * exercise the USER role manually, edit the row : `UPDATE app_user SET role='USER' WHERE
 * email='dev@local.test'`.
 */
@Component
@Profile("local-no-auth")
class LocalNoAuthUserInitializer(private val userRepository: UserRepository) : CommandLineRunner {

  override fun run(vararg args: String) {
    if (userRepository.findByEmail(LocalNoAuthFilter.LOCAL_DEV_EMAIL) != null) return
    userRepository.save(
      User(
        email = LocalNoAuthFilter.LOCAL_DEV_EMAIL,
        displayName = "Dev (local-no-auth)",
        provider = "local-dev",
        providerId = null,
        role = Role.ADMIN,
        lastLoginAt = Instant.now(),
      )
    )
  }
}
