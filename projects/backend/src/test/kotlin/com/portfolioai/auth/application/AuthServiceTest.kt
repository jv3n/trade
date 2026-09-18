package com.portfolioai.auth.application

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.auth.infrastructure.security.AppOAuth2User
import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.server.ResponseStatusException

/**
 * Tests on [AuthService] — the read-side bridge between the Spring `SecurityContext` and our [User]
 * DB row.
 *
 * Each test sets up (or deliberately doesn't set up) the security context manually rather than
 * going through Spring Security wiring, so the cases stay focused on the resolution logic itself :
 * - The happy path : an [AppOAuth2User] principal is in context, the user exists in DB, the service
 *   returns the fresh row.
 * - The wiring-bug paths : missing authentication, wrong principal type, principal referencing a
 *   deleted user. All three are [IllegalStateException] because they indicate a regression in the
 *   chain — `SecurityConfig` + `LocalNoAuthFilter` + Spring Security itself should never route an
 *   unauthenticated request to a method that calls [AuthService.getCurrentUser].
 * - [AuthService.isAdmin] : trivially reads [User.role] but pinned here so future role additions
 *   don't accidentally make a new role admin-equivalent.
 *
 * `@AfterEach` clears the security context so a test that sets it doesn't leak state into the next
 * one (`SecurityContextHolder` is thread-local but the JUnit runner reuses the thread).
 */
class AuthServiceTest {

  private val userRepository: UserRepository = mock()
  private val service = AuthService(userRepository)

  @AfterEach
  fun tearDown() {
    SecurityContextHolder.clearContext()
  }

  // ---------------------------------------------------------------------- happy paths

  @Test
  fun `getCurrentUser returns the DB row referenced by the AppOAuth2User principal`() {
    val user = user(email = "julien@example.com", role = Role.ADMIN)
    setPrincipal(AppOAuth2User(user.id, user.email, emptyMap(), emptyList()))
    given(userRepository.findById(eq(user.id))).willReturn(Optional.of(user))

    val resolved = service.getCurrentUser()

    // Important : `assertSame` (not `assertEquals`) — we want the *fresh* DB row, not a copy.
    // The role can have been flipped server-side since login (manual SQL update, future admin
    // endpoint) and the resolver must reflect that.
    assertSame(user, resolved)
  }

  @Test
  fun `isAdmin returns true for a user with role ADMIN`() {
    val admin = user(email = "admin@example.com", role = Role.ADMIN)
    setPrincipal(AppOAuth2User(admin.id, admin.email, emptyMap(), emptyList()))
    given(userRepository.findById(eq(admin.id))).willReturn(Optional.of(admin))

    assertTrue(service.isAdmin())
  }

  @Test
  fun `isAdmin returns false for a user with role USER`() {
    val regular = user(email = "user@example.com", role = Role.USER)
    setPrincipal(AppOAuth2User(regular.id, regular.email, emptyMap(), emptyList()))
    given(userRepository.findById(eq(regular.id))).willReturn(Optional.of(regular))

    assertFalse(service.isAdmin())
  }

  // ---------------------------------------------------------------------- wiring-bug paths

  @Test
  fun `getCurrentUser throws when no authentication is in the security context`() {
    // Should never happen in practice — Spring Security returns 401 before any controller method
    // runs when there's no auth. If this fires, someone has wired an authenticated controller
    // path with `permitAll()` and the contract is broken — surface loudly rather than return a
    // misleading default user.
    val ex = assertThrows<IllegalStateException> { service.getCurrentUser() }
    assertTrue(ex.message?.contains("No authentication") ?: false)
  }

  @Test
  fun `getCurrentUser throws when the principal is not an AppOAuth2User`() {
    // Defends against someone introducing a second authentication strategy (basic auth, custom
    // JWT) without producing an AppOAuth2User principal. Loud failure rather than a silent
    // ClassCastException — the message names the actual class so the debugger knows where to
    // look.
    setPrincipal("a-string-principal")

    val ex = assertThrows<IllegalStateException> { service.getCurrentUser() }
    assertTrue(ex.message?.contains("Unexpected principal type") ?: false)
  }

  @Test
  fun `getCurrentUser throws when the principal references a user no longer in DB`() {
    // The principal carries the DB id baked at login time. If someone DELETEs the row out from
    // under an active session, subsequent requests must fail explicitly rather than return a
    // ghost / cached identity.
    val ghostId = UUID.randomUUID()
    setPrincipal(AppOAuth2User(ghostId, "ghost@example.com", emptyMap(), emptyList()))
    given(userRepository.findById(eq(ghostId))).willReturn(Optional.empty())

    val ex = assertThrows<IllegalStateException> { service.getCurrentUser() }
    assertTrue(ex.message?.contains("no longer exists") ?: false)
  }

  // ---------------------------------------------------------------------- updatePreferences

  @Test
  fun `updatePreferences applies theme and language and persists`() {
    val u = user(email = "u@example.com", role = Role.USER) // defaults theme=dark, language=fr
    setPrincipal(AppOAuth2User(u.id, u.email, emptyMap(), emptyList()))
    given(userRepository.findById(eq(u.id))).willReturn(Optional.of(u))
    given(userRepository.save(any<User>())).willAnswer { it.getArgument(0) }

    val saved = service.updatePreferences(theme = "light", language = "en")

    assertEquals("light", saved.theme)
    assertEquals("en", saved.language)
  }

  @Test
  fun `updatePreferences leaves a null field untouched`() {
    // The SPA sends only the knob that changed — a null field must not reset the other preference.
    val u = user(email = "u@example.com", role = Role.USER) // theme=dark, language=fr
    setPrincipal(AppOAuth2User(u.id, u.email, emptyMap(), emptyList()))
    given(userRepository.findById(eq(u.id))).willReturn(Optional.of(u))
    given(userRepository.save(any<User>())).willAnswer { it.getArgument(0) }

    service.updatePreferences(theme = "light", language = null)

    assertEquals("light", u.theme)
    assertEquals("fr", u.language, "language left at its default — not nulled")
  }

  @Test
  fun `updatePreferences rejects an unknown theme with 400`() {
    val u = user(email = "u@example.com", role = Role.USER)
    setPrincipal(AppOAuth2User(u.id, u.email, emptyMap(), emptyList()))
    given(userRepository.findById(eq(u.id))).willReturn(Optional.of(u))

    val ex =
      assertThrows<ResponseStatusException> {
        service.updatePreferences(theme = "sepia", language = null)
      }
    assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
  }

  // ---------------------------------------------------------------------- helpers

  private fun setPrincipal(principal: Any) {
    val auth =
      UsernamePasswordAuthenticationToken(
        principal,
        null,
        listOf(SimpleGrantedAuthority("ROLE_USER")),
      )
    SecurityContextHolder.getContext().authentication = auth
  }

  private fun user(
    id: UUID = UUID.randomUUID(),
    email: String,
    role: Role,
    displayName: String? = null,
  ): User =
    User(
        id = id,
        email = email,
        displayName = displayName,
        provider = "google",
        providerId = "sub-${id.toString().take(8)}",
        role = role,
        createdAt = Instant.parse("2026-05-17T10:00:00Z"),
        lastLoginAt = Instant.parse("2026-05-17T10:00:00Z"),
      )
      .also { assertEquals(role, it.role) /* sanity — factory used correctly */ }
}
