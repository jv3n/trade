package com.portfolioai.auth.infrastructure.security

import jakarta.servlet.http.Cookie
import java.time.Instant
import java.util.Base64
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContext
import org.springframework.security.core.context.SecurityContextImpl
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.web.context.HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY
import org.springframework.session.Session
import org.springframework.session.SessionRepository
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * Pins the session store (#460). Production serves up to three Cloud Run instances with no affinity
 * and scales to zero : a session held in one JVM's memory was lost on the next instance, after
 * every idle period and on every deploy. Sessions now live in Postgres.
 *
 * What a typecheck can't catch :
 * - **the session is in the database** — the next request reads it back from the tables `V14`
 *   creates, not from memory ;
 * - **both principals serialise** — the e2e / OAuth2 one ([AppOAuth2User]) and Google's OIDC one
 *   ([AppOidcUser]) ; an unserialisable principal fails the sign-in itself ;
 * - **an unreadable session signs the user out rather than failing** — after a release that changes
 *   a class stored in the session, the request gets a 401, not a 500 until the row expires ;
 * - **signing out deletes the row**.
 *
 * Signs in through the `e2e` profile's route : Google's flow can't be driven from a test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("e2e")
class SessionStoreIntegrationTest {

  @Autowired private lateinit var mvc: MockMvc
  @Autowired private lateinit var repository: JdbcIndexedSessionRepository
  @Autowired private lateinit var jdbc: JdbcTemplate

  @Test
  fun `a signed-in session is stored in Postgres and read back from it`() {
    val cookie = login()

    val context = contextOf(sessionId(cookie))
    assertInstanceOf(AppOAuth2User::class.java, context.authentication.principal)
    mvc.perform(get("/api/me").cookie(cookie)).andExpect(status().isOk)
  }

  @Test
  fun `a Google sign-in's OIDC principal survives the store`() {
    val userId = UUID.randomUUID()
    val authorities = listOf(SimpleGrantedAuthority("ROLE_USER"))
    val idToken =
      OidcIdToken(
        "id-token",
        Instant.now(),
        Instant.now().plusSeconds(3600),
        mapOf("sub" to "google-sub-1", "email" to "trader@test.local"),
      )
    val principal = AppOidcUser(userId, authorities, idToken)
    val session = sessions.createSession()
    session.setAttribute(
      SPRING_SECURITY_CONTEXT_KEY,
      SecurityContextImpl(OAuth2AuthenticationToken(principal, authorities, "google")),
    )
    sessions.save(session)

    val read = contextOf(session.id).authentication.principal as AppOidcUser
    assertEquals(userId, read.userId)
    assertEquals("google-sub-1", read.name)
  }

  // What a release changing a class inside the session looks like to the next request : bytes that
  // no longer deserialise. Spring's converter would throw on every request of that session.
  @Test
  fun `a session whose context no longer deserialises answers 401, not 500`() {
    val cookie = login()
    jdbc.update(
      """
      UPDATE spring_session_attributes SET attribute_bytes = ?
      WHERE attribute_name = ? AND session_primary_id =
        (SELECT primary_id FROM spring_session WHERE session_id = ?)
      """,
      byteArrayOf(0x00, 0x01, 0x02),
      SPRING_SECURITY_CONTEXT_KEY,
      sessionId(cookie),
    )

    mvc.perform(get("/api/me").cookie(cookie)).andExpect(status().isUnauthorized)
  }

  @Test
  fun `signing out deletes the session row`() {
    val cookie = login()
    val id = sessionId(cookie)
    assertNotNull(sessions.findById(id))

    mvc.perform(post("/logout").cookie(cookie).with(csrf())).andExpect(status().is3xxRedirection)

    assertEquals(0, rowsFor(id))
    mvc.perform(get("/api/me").cookie(cookie)).andExpect(status().isUnauthorized)
  }

  // Its session type, `JdbcSession`, is package-private : Kotlin can't name it, so the repository
  // is used through its public interface.
  @Suppress("UNCHECKED_CAST")
  private val sessions: SessionRepository<Session>
    get() = repository as SessionRepository<Session>

  /** Reads the session back through the repository — a query on the tables, never memory. */
  private fun contextOf(sessionId: String): SecurityContext =
    sessions.findById(sessionId)!!.getAttribute<SecurityContext>(SPRING_SECURITY_CONTEXT_KEY)!!

  private fun login(): Cookie =
    mvc
      .perform(post("/api/e2e/login"))
      .andExpect(status().isOk)
      .andReturn()
      .response
      .getCookie("SESSION")!!

  /** The cookie carries the session id Base64-encoded — Spring Session's default serializer. */
  private fun sessionId(cookie: Cookie): String = String(Base64.getDecoder().decode(cookie.value))

  private fun rowsFor(sessionId: String): Int =
    jdbc.queryForObject(
      "SELECT count(*) FROM spring_session WHERE session_id = ?",
      Int::class.java,
      sessionId,
    )!!
}
