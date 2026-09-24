package com.portfolioai.shared

import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * Pins what `/actuator/info` hands the settings page (#380) : the environment that answers, and the
 * build it runs — through the route, so dropping `info` from the web exposure fails here too. The
 * environment comes from `SENTRY_ENVIRONMENT`, set by the deploy to `staging` / `prod` ; nothing
 * sets it here, so it must read `local` — a missing env contributor (Spring Boot 3 ships it
 * disabled) would drop the key and leave the page without its chip.
 *
 * It also pins who may read it : a session, not the whole internet — while the health probes Cloud
 * Run relies on stay open.
 */
@SpringBootTest(properties = ["management.endpoint.health.probes.enabled=true"])
@AutoConfigureMockMvc
class ActuatorInfoIntegrationTest {

  @Autowired private lateinit var mvc: MockMvc

  @Test
  fun `names the local environment and the build it runs to a signed-in user`() {
    mvc
      .perform(get("/actuator/info").with(user("trader")))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.environment").value("local"))
      .andExpect(jsonPath("$.build.version", notNullValue()))
  }

  @Test
  fun `refuses the release and the commit to an anonymous caller`() {
    mvc.perform(get("/actuator/info")).andExpect(status().isUnauthorized)
  }

  @Test
  fun `leaves the liveness probe open, or Cloud Run would restart the container`() {
    mvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk)
  }
}
