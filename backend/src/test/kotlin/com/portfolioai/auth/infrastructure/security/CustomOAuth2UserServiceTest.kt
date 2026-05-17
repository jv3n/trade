package com.portfolioai.auth.infrastructure.security

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.user.DefaultOAuth2User

/**
 * Tests on [CustomOAuth2UserService.processOAuth2User] — the post-fetch handling that bridges a
 * Google userinfo response to our [User] DB row.
 *
 * We deliberately don't exercise [CustomOAuth2UserService.loadUser] because it delegates HTTP to
 * Spring's `DefaultOAuth2UserService.loadUser` ; the refactor that extracted
 * [CustomOAuth2UserService.processOAuth2User] (livré with the Phase 4 auth foundation) exists
 * specifically so the tests can pin behaviour without mocking the HTTP path. Spring's HTTP layer is
 * its own responsibility.
 *
 * What we pin :
 * - **First login creates a row** with role computed from the `app.admin.emails` whitelist
 *   (case-insensitive match). Two scenarios — match → ADMIN, no match → USER.
 * - **Subsequent logins update in place** (`lastLoginAt`, `providerId`, `displayName` if Google
 *   returns one) but **do NOT re-evaluate the role**. The DB is the source of truth post-creation —
 *   a manual rétrogradation `UPDATE app_user SET role='USER'` must survive the next login of
 *   someone still in the whitelist. Pin this explicitly because it's the kind of "obvious" rule a
 *   future refactor would silently break.
 * - **Missing `email` or `sub` claims** throw [IllegalStateException]. Google should never return
 *   userinfo without these (the scopes are `openid profile email`) — if it happens, scope
 *   configuration drifted and we surface loudly rather than insert a row with a synthesised key.
 * - **Returned `AppOAuth2User` carries the correct role authority** (`ROLE_ADMIN` / `ROLE_USER`) —
 *   that's what `hasRole(...)` matchers in `SecurityConfig` rely on.
 */
class CustomOAuth2UserServiceTest {

  private val userRepository: UserRepository = mock()

  private fun service(adminEmails: String = "venet.julien@gmail.com,ops@portfolioai.com") =
    CustomOAuth2UserService(userRepository, adminEmails)

  // ---------------------------------------------------------------------- creation

  @Test
  fun `first login of a non-admin email creates a row with role USER`() {
    given(userRepository.findByEmail(eq("alice@example.com"))).willReturn(null)
    given(userRepository.save(any<User>())).willAnswer { invocation ->
      invocation.arguments[0] as User
    }

    val principal =
      service().processOAuth2User(googleUser("alice@example.com", "sub-alice", "Alice"), "google")

    val saved = argumentCaptor<User>().also { verify(userRepository).save(it.capture()) }.firstValue
    assertEquals("alice@example.com", saved.email)
    assertEquals(Role.USER, saved.role)
    assertEquals("Alice", saved.displayName)
    assertEquals("sub-alice", saved.providerId)
    assertEquals("google", saved.provider)
    assertEquals(setOf(SimpleGrantedAuthority("ROLE_USER")), principal.authorities.toSet())
  }

  @Test
  fun `first login of a whitelisted email creates a row with role ADMIN`() {
    given(userRepository.findByEmail(eq("ops@portfolioai.com"))).willReturn(null)
    given(userRepository.save(any<User>())).willAnswer { invocation ->
      invocation.arguments[0] as User
    }

    val principal =
      service()
        .processOAuth2User(googleUser("ops@portfolioai.com", "sub-ops", "Ops Team"), "google")

    val saved = argumentCaptor<User>().also { verify(userRepository).save(it.capture()) }.firstValue
    assertEquals(Role.ADMIN, saved.role)
    assertEquals(setOf(SimpleGrantedAuthority("ROLE_ADMIN")), principal.authorities.toSet())
  }

  @Test
  fun `admin email whitelist match is case-insensitive`() {
    // Real Google replies have varied casing on the email claim depending on how the user typed
    // their Gmail at signup. The whitelist is lowercased once at parse time, the lookup
    // lowercases the inbound email — pin both halves so a future refactor that drops one side
    // doesn't silently demote the operator's first login.
    given(userRepository.findByEmail(eq("Venet.Julien@gmail.com"))).willReturn(null)
    given(userRepository.save(any<User>())).willAnswer { invocation ->
      invocation.arguments[0] as User
    }

    service()
      .processOAuth2User(googleUser("Venet.Julien@gmail.com", "sub-jv", "Julien Venet"), "google")

    val saved = argumentCaptor<User>().also { verify(userRepository).save(it.capture()) }.firstValue
    assertEquals(Role.ADMIN, saved.role)
  }

  @Test
  fun `whitelist tolerates surrounding whitespace and empty entries`() {
    // `app.admin.emails` is a comma-separated string read from YAML — copy-paste edits regularly
    // leave a trailing comma or whitespace around emails. The parsing should be forgiving so the
    // ops team doesn't get demoted by a stray space.
    given(userRepository.findByEmail(any())).willReturn(null)
    given(userRepository.save(any<User>())).willAnswer { invocation ->
      invocation.arguments[0] as User
    }

    service(adminEmails = " ops@portfolioai.com ,  , alice@example.com,")
      .processOAuth2User(googleUser("alice@example.com", "sub-alice", "Alice"), "google")

    val saved = argumentCaptor<User>().also { verify(userRepository).save(it.capture()) }.firstValue
    assertEquals(Role.ADMIN, saved.role)
  }

  // ---------------------------------------------------------------------- existing user update

  @Test
  fun `subsequent login updates lastLoginAt + providerId + displayName but not the role`() {
    // Returning user, was created as USER once. Even if the whitelist now matches their email
    // (operator added them between two logins), the saved role stays USER — manual
    // promotion/demotion via SQL is the supported path. The whitelist is a *seed*, not a
    // recurring authority.
    val existing =
      user(
        email = "alice@example.com",
        role = Role.USER,
        displayName = "Old Name",
        providerId = "old-sub",
        lastLoginAt = Instant.parse("2026-05-01T10:00:00Z"),
      )
    given(userRepository.findByEmail(eq("alice@example.com"))).willReturn(existing)

    // Whitelist NOW contains alice — but she was created as USER. We expect the role to remain
    // USER.
    val whitelistService = service(adminEmails = "alice@example.com")
    val principal =
      whitelistService.processOAuth2User(
        googleUser("alice@example.com", "new-sub", "Alice Updated"),
        "google",
      )

    // Existing row mutated in place
    assertEquals("Alice Updated", existing.displayName)
    assertEquals("new-sub", existing.providerId)
    // lastLoginAt was bumped — we just check it moved forward from the seed value
    assertTrue(existing.lastLoginAt!!.isAfter(Instant.parse("2026-05-01T10:00:00Z")))
    // Role is unchanged
    assertEquals(Role.USER, existing.role)
    // No `save` call — JPA dirty checking handles the mutation. Pinning this so a future refactor
    // that switches to detached entities doesn't silently break the in-place update contract.
    verify(userRepository, never()).save(any())
    // Principal carries the (still USER) role
    assertEquals(setOf(SimpleGrantedAuthority("ROLE_USER")), principal.authorities.toSet())
    assertSame(existing.id, principal.userId)
  }

  @Test
  fun `subsequent login keeps the existing displayName when Google returns blank`() {
    // Defends a small UX nicety : if the user's Gmail profile name is empty on the day they
    // re-login (rare but happens during account migrations), don't erase the name we already
    // had. Same intent as the null check on creation — never overwrite with worse data.
    val existing =
      user(email = "alice@example.com", role = Role.USER, displayName = "Alice Real Name")
    given(userRepository.findByEmail(eq("alice@example.com"))).willReturn(existing)

    service().processOAuth2User(googleUser("alice@example.com", "sub-alice", ""), "google")

    assertEquals("Alice Real Name", existing.displayName)
  }

  // ---------------------------------------------------------------------- missing claims

  @Test
  fun `processOAuth2User throws when the email claim is missing from the userinfo response`() {
    val ex =
      assertThrows<IllegalStateException> {
        service()
          .processOAuth2User(
            DefaultOAuth2User(emptyList(), mapOf("sub" to "sub-x", "name" to "X"), "sub"),
            "google",
          )
      }
    assertTrue(ex.message?.contains("email claim") ?: false)
    verify(userRepository, never()).save(any())
  }

  @Test
  fun `processOAuth2User throws when the sub claim is missing from the userinfo response`() {
    // `DefaultOAuth2User` throws at construction if `nameAttributeKey` points at a null attribute,
    // so we can't reproduce "missing sub" by pointing nameAttributeKey at `sub` and omitting it.
    // We use `email` as the name key instead — that's not what Google's real OIDC config does,
    // but it lets us construct an OAuth2User whose attributes map lacks `sub` so our explicit
    // null check inside `processOAuth2User` fires.
    val ex =
      assertThrows<IllegalStateException> {
        service()
          .processOAuth2User(
            DefaultOAuth2User(
              emptyList(),
              mapOf("email" to "x@example.com", "name" to "X"),
              "email",
            ),
            "google",
          )
      }
    assertTrue(ex.message?.contains("sub claim") ?: false)
    verify(userRepository, never()).save(any())
  }

  // ---------------------------------------------------------------------- helpers

  private fun googleUser(email: String, sub: String, name: String): DefaultOAuth2User {
    val attributes = mutableMapOf<String, Any>("email" to email, "sub" to sub)
    if (name.isNotEmpty()) attributes["name"] = name
    // `nameAttributeKey = sub` — what Google's OIDC config registers ; the value at this key is
    // what `OAuth2User.getName()` returns. The real Spring stack defaults to `sub` for Google.
    return DefaultOAuth2User(emptyList(), attributes, "sub")
  }

  private fun user(
    id: UUID = UUID.randomUUID(),
    email: String,
    role: Role,
    displayName: String? = null,
    providerId: String? = "sub-test",
    lastLoginAt: Instant? = Instant.parse("2026-05-17T10:00:00Z"),
  ): User =
    User(
      id = id,
      email = email,
      displayName = displayName,
      provider = "google",
      providerId = providerId,
      role = role,
      createdAt = Instant.parse("2026-05-01T10:00:00Z"),
      lastLoginAt = lastLoginAt,
    )
}
