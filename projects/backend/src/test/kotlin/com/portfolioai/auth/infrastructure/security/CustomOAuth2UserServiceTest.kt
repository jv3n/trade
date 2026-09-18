package com.portfolioai.auth.infrastructure.security

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.config.application.AppConfigService
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
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
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

  private fun service(
    adminEmails: String = "venet.julien@gmail.com,ops@portfolioai.com",
    allowedEmails: Set<String> = emptySet(),
  ): CustomOAuth2UserService {
    // `AppConfigService` is a concrete Kotlin `@Service` class. Mockito can subclass it only
    // because `kotlin-allopen` (configured under the `spring` preset in `build.gradle.kts`) opens
    // `@Service`-annotated classes and their methods. If the allopen scope is ever narrowed, this
    // `mock()` call will fail with "Cannot mock/spy because final class" — switch to mocking the
    // single method via a hand-rolled stub class implementing the same `getAllowedEmails()`
    // contract.
    val appConfigService: AppConfigService = mock()
    given(appConfigService.getAllowedEmails()).willReturn(allowedEmails)
    return CustomOAuth2UserService(userRepository, adminEmails, appConfigService)
  }

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

  // ---------------------------------------------------------------------- allowed-emails gate

  @Test
  fun `login is open when the allowed list is empty (laxiste mode)`() {
    // Backward-compat for a fresh deploy : the admin hasn't yet posted the first list, so the gate
    // lets everyone in (with role USER by default). The moment they post the first email via
    // `/settings/access-control`, the next login of anyone else gets rejected.
    given(userRepository.findByEmail(eq("stranger@example.com"))).willReturn(null)
    given(userRepository.save(any<User>())).willAnswer { it.arguments[0] as User }

    service(allowedEmails = emptySet())
      .processOAuth2User(googleUser("stranger@example.com", "sub-x", "X"), "google")

    verify(userRepository).save(any())
  }

  @Test
  fun `login is allowed when the email is in the whitelist`() {
    given(userRepository.findByEmail(eq("alice@example.com"))).willReturn(null)
    given(userRepository.save(any<User>())).willAnswer { it.arguments[0] as User }

    service(allowedEmails = setOf("alice@example.com", "bob@example.com"))
      .processOAuth2User(googleUser("alice@example.com", "sub-alice", "Alice"), "google")

    verify(userRepository).save(any())
  }

  @Test
  fun `login is rejected with not_authorized when the email is not in the whitelist`() {
    // Critical security invariant. The exception code is `not_authorized` — `SecurityConfig` reads
    // it in its `failureHandler` to redirect with `?error=not_authorized` so the SPA can show an
    // inline message. Any other code would fall through to the generic "oauth_failed" banner,
    // which would be misleading.
    val ex =
      assertThrows<OAuth2AuthenticationException> {
        service(allowedEmails = setOf("alice@example.com"))
          .processOAuth2User(googleUser("eve@example.com", "sub-eve", "Eve"), "google")
      }
    assertEquals("not_authorized", ex.error.errorCode)
    // No row is created — the rejection happens before `findByEmail` even runs, so the DB stays
    // untouched. Pinning this so a future refactor that moves the gate below the existing-user
    // lookup doesn't silently start leaking USER rows for rejected emails.
    verify(userRepository, never()).save(any())
    verify(userRepository, never()).findByEmail(any())
  }

  @Test
  fun `admin emails are auto-included in the effective whitelist`() {
    // Foot-gun guard : the operator can't lock themselves out by retiring their own email from the
    // UI list. `APP_ADMIN_EMAILS` (boot-time env var) is always in the effective set, regardless
    // of what the DB-backed allowed list says.
    given(userRepository.findByEmail(eq("ops@portfolioai.com"))).willReturn(null)
    given(userRepository.save(any<User>())).willAnswer { it.arguments[0] as User }

    // `ops@portfolioai.com` is in the default adminEmails seed but NOT in allowedEmails.
    service(allowedEmails = setOf("alice@example.com"))
      .processOAuth2User(googleUser("ops@portfolioai.com", "sub-ops", "Ops"), "google")

    val saved = argumentCaptor<User>().also { verify(userRepository).save(it.capture()) }.firstValue
    assertEquals(Role.ADMIN, saved.role)
  }

  @Test
  fun `existing user is rejected if their email is no longer in the effective whitelist`() {
    // Pre-gated row (created during the open-mode bootstrap) must NOT be able to relogin once the
    // admin gates the app and forgets to add this user back. The check sits at the top of
    // `findOrCreateUser`, before the existing-user lookup — so even a row that already exists in
    // the DB gets rejected at the gate.
    val existing = user(email = "alice@example.com", role = Role.USER)
    given(userRepository.findByEmail(eq("alice@example.com"))).willReturn(existing)

    val ex =
      assertThrows<OAuth2AuthenticationException> {
        service(allowedEmails = setOf("carol@example.com"))
          .processOAuth2User(googleUser("alice@example.com", "sub-alice", "Alice"), "google")
      }
    assertEquals("not_authorized", ex.error.errorCode)
    // Existing row remains in the DB (we don't auto-delete on whitelist removal) but no update
    // either — the row is frozen in its last-known state until the admin re-adds the email.
    verify(userRepository, never()).save(any())
  }

  @Test
  fun `whitelist match is case-insensitive on inbound email`() {
    // The whitelist is lowercased once at `AppConfigService.getAllowedEmails()` ; the inbound
    // email may come back from Google with mixed casing depending on how the user typed their
    // Gmail at signup. Pin that the lowercasing on the lookup side matches.
    given(userRepository.findByEmail(eq("Alice@Example.com"))).willReturn(null)
    given(userRepository.save(any<User>())).willAnswer { it.arguments[0] as User }

    service(allowedEmails = setOf("alice@example.com"))
      .processOAuth2User(googleUser("Alice@Example.com", "sub-alice", "Alice"), "google")

    verify(userRepository).save(any())
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
