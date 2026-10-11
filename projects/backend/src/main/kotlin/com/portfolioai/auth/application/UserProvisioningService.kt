package com.portfolioai.auth.application

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.config.application.AppConfigService
import java.time.Instant
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.ApplicationEventPublisher
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Turns a Google login into its [User] row : gates the email against the whitelist, then finds the
 * row and refreshes it, or creates it. Shared by the OAuth2 and the OIDC user services, which only
 * differ in how they read the claims.
 *
 * Its own bean so both login paths reach the transaction through a cross-bean call (#590) : the
 * user services extend Spring classes whose setters are `final`, which CGLIB cannot proxy.
 *
 * **Role assignment is one-shot** — at user creation only. Re-applying the whitelist on every login
 * would erase a manual demotion (`UPDATE app_user SET role='USER'`) and would only apply promotions
 * on the *next* login of someone newly added to the whitelist, which is surprising. The DB is the
 * source of truth post-creation ; the whitelist only seeds.
 */
@Service
class UserProvisioningService(
  private val userRepository: UserRepository,
  @Value("\${app.admin.emails:}") private val adminEmailsRaw: String,
  private val appConfigService: AppConfigService,
  private val events: ApplicationEventPublisher,
) {

  private val log = LoggerFactory.getLogger(javaClass)

  private val adminEmails: Set<String> by lazy {
    adminEmailsRaw.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
  }

  /**
   * Allowed-emails gate. Reads the live whitelist from [AppConfigService] (DB override > YAML
   * default > empty), unions with [adminEmails] so the operator is auto-included, and rejects with
   * an [OAuth2AuthenticationException] carrying the `not_authorized` error code if the inbound
   * email is not in the effective set. `SecurityConfig` reads that code and redirects the user to
   * `/login?error=not_authorized` for an inline message.
   *
   * Empty whitelist = open mode (laxiste) — anyone with a Google account is let in. Backward-compat
   * for a fresh deploy before the admin posts the first list via `/settings/access-control`.
   *
   * Check happens at the **very top** of [findOrCreateUser] — covers both new logins (no row to
   * create) and existing users (a row created under open mode should no longer log in once the
   * admin gates the app). Pin this so a future refactor that moves the check below the
   * existing-user lookup doesn't silently let pre-gated users bypass the whitelist.
   */
  private fun assertAuthorized(email: String) {
    val allowed = appConfigService.getAllowedEmails()
    if (allowed.isEmpty()) return
    val emailLower = email.lowercase()
    if (emailLower in allowed) return
    if (emailLower in adminEmails) return
    throw OAuth2AuthenticationException(OAuth2Error("not_authorized"))
  }

  /**
   * Mutates the row in place when found — dirty checking writes it, hence the transaction ; saves a
   * fresh row when not, applying the admin-email whitelist at creation only.
   *
   * **Logs only the user `id` (UUID) — never the email.** The email is PII ; for prod audit /
   * debug, the `id` is enough to correlate a login event with the row in `app_user` via SQL. The
   * provider + role are logged because they're not PII and they're useful for "who landed in ADMIN
   * this morning" type queries. Same convention applies anywhere else in the codebase : log
   * `user.id`, never `user.email`.
   */
  @Transactional
  fun findOrCreateUser(email: String, sub: String, name: String?, provider: String): User {
    assertAuthorized(email)
    val existing = userRepository.findByEmail(email)
    if (existing != null) {
      if (!name.isNullOrBlank()) existing.displayName = name
      existing.providerId = sub
      existing.lastLoginAt = Instant.now()
      log.info("OAuth login (existing user) — id={} provider={}", existing.id, provider)
      return existing
    }
    val assignedRole = if (email.lowercase() in adminEmails) Role.ADMIN else Role.USER
    val created =
      userRepository.save(
        User(
          email = email,
          displayName = name,
          provider = provider,
          providerId = sub,
          role = assignedRole,
          lastLoginAt = Instant.now(),
        )
      )
    log.info(
      "OAuth login (new user created) — id={} provider={} role={}",
      created.id,
      provider,
      assignedRole,
    )
    events.publishEvent(UserCreatedEvent(created.id))
    return created
  }
}
