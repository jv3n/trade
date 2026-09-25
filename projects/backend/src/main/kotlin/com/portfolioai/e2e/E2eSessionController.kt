package com.portfolioai.e2e

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.application.dto.CurrentUserDto
import com.portfolioai.auth.application.dto.toCurrentUserDto
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.auth.infrastructure.security.AppOAuth2User
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.core.env.Environment
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

/** Provider of the throwaway users — the only ones [E2eSessionController.delete] may remove. */
const val E2E_PROVIDER = "e2e"

/**
 * The end-to-end suite's way in (#367) : Google sign-in can't be driven from a test, so under the
 * `e2e` profile a POST opens a session for a **brand-new user**, and a DELETE removes that user
 * with everything they own. Each test gets its own user, so no two tests share data.
 *
 * The user is created without `UserCreatedEvent` : the `local` seeder listens to it, and a test
 * starts from an empty account. Refuses to start next to `prod`, which staging runs too.
 */
@Profile("e2e")
@RestController
@RequestMapping("/api/e2e")
class E2eSessionController(
  private val users: UserRepository,
  private val authService: AuthService,
  private val jdbc: JdbcTemplate,
  environment: Environment,
) {

  private val log = LoggerFactory.getLogger(javaClass)
  private val contexts = HttpSessionSecurityContextRepository()

  init {
    check(!environment.matchesProfiles("prod")) { "The e2e profile must never run with prod" }
  }

  @PostMapping("/login")
  @Transactional
  fun login(request: HttpServletRequest, response: HttpServletResponse): CurrentUserDto {
    val user =
      users.save(
        User(
          email = "e2e-${UUID.randomUUID()}@e2e.local",
          displayName = "E2E",
          provider = E2E_PROVIDER,
          role = Role.USER,
        )
      )
    val authorities = listOf(SimpleGrantedAuthority("ROLE_${user.role.name}"))
    val principal =
      AppOAuth2User(user.id, user.email, mapOf("sub" to user.id.toString()), authorities)
    val context = SecurityContextHolder.createEmptyContext()
    context.authentication = OAuth2AuthenticationToken(principal, authorities, E2E_PROVIDER)
    SecurityContextHolder.setContext(context)
    contexts.saveContext(context, request, response)
    log.info("e2e session opened : userId={}", user.id)
    return user.toCurrentUserDto()
  }

  /** Removes the current user and their data ; refused for anyone but an e2e user. */
  @DeleteMapping("/me")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  fun delete(request: HttpServletRequest) {
    val user = authService.getCurrentUser()
    // Tilt runs `local,e2e` : the developer's own session reaches this route too.
    if (user.provider != E2E_PROVIDER) {
      throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only an e2e user can be deleted")
    }
    // `trade_entry → stat_entry` is ON DELETE RESTRICT : cascading from the user alone can trip it.
    jdbc.update("DELETE FROM trade_entry WHERE user_id = ?", user.id)
    jdbc.update("DELETE FROM app_user WHERE id = ?", user.id)
    request.getSession(false)?.invalidate()
    log.info("e2e user deleted : userId={}", user.id)
  }
}
