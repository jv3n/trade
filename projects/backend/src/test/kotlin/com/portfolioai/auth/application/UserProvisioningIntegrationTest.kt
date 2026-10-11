package com.portfolioai.auth.application

import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.auth.infrastructure.security.CustomOAuth2UserService
import com.portfolioai.auth.infrastructure.security.CustomOidcUserService
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.aop.support.AopUtils
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest

/**
 * Pins where the login transaction lives (#590) : on [UserProvisioningService], reached from both
 * user services through a cross-bean call — never on the user services themselves.
 *
 * - **The user services are not proxied** — they extend Spring classes whose setters are `final`,
 *   and a CGLIB proxy logs one warning per final setter at every cold start. A `@Transactional`
 *   creeping back onto them brings the five warnings back.
 * - **The provisioning service is** — so the find-or-create runs in one transaction on both paths.
 * - **A returning user's refresh reaches the database** — the existing row is updated through dirty
 *   checking, with no `save` : outside a transaction the change would be silently lost.
 */
@SpringBootTest
class UserProvisioningIntegrationTest {

  @Autowired private lateinit var provisioning: UserProvisioningService
  @Autowired private lateinit var oauth2UserService: CustomOAuth2UserService
  @Autowired private lateinit var oidcUserService: CustomOidcUserService
  @Autowired private lateinit var userRepository: UserRepository

  @Test
  fun `the user services are plain beans, the provisioning service carries the transaction`() {
    assertFalse(AopUtils.isAopProxy(oauth2UserService))
    assertFalse(AopUtils.isAopProxy(oidcUserService))
    assertTrue(AopUtils.isAopProxy(provisioning))
  }

  @Test
  fun `a first login creates the user and a second one reuses and refreshes it`() {
    val email = "trader-${UUID.randomUUID()}@example.com"

    val created = provisioning.findOrCreateUser(email, "sub-1", "Alice", "google")
    val again = provisioning.findOrCreateUser(email, "sub-2", "Alice Martin", "google")

    assertEquals(created.id, again.id)
    val stored = userRepository.findByEmail(email)!!
    assertEquals("Alice Martin", stored.displayName)
    assertEquals("sub-2", stored.providerId)
  }
}
