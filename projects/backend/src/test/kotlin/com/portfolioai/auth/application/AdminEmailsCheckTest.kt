package com.portfolioai.auth.application

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.springframework.boot.test.context.runner.ApplicationContextRunner

/**
 * Pins the boot check behind the fail-closed login gate (#840) : with no admin, an environment
 * would start healthy and refuse every login, with no signal.
 *
 * - **A deployed environment without an admin does not boot**, a blank list included.
 * - **Local, CI and tests are left alone** : the check belongs to the `prod` profile.
 */
class AdminEmailsCheckTest {

  private val context =
    ApplicationContextRunner().withUserConfiguration(AdminEmailsCheck::class.java)

  @Test
  fun `an admin email lets the environment boot`() {
    assertDoesNotThrow { AdminEmailsCheck("trader@example.com") }
  }

  @Test
  fun `no admin email stops the boot, and the message names the variable`() {
    val refused = assertThrows(IllegalStateException::class.java) { AdminEmailsCheck("") }

    assertEquals(
      "APP_ADMIN_EMAILS is empty : nobody could log in to this environment",
      refused.message,
    )
  }

  // Copy-paste in a secret : `parseEmailList` drops the empty tokens, so this is no list at all.
  @Test
  fun `a list of blanks and commas counts as empty`() {
    assertThrows(IllegalStateException::class.java) { AdminEmailsCheck(" , ,") }
  }

  @Test
  fun `the prod profile fails its startup without an admin`() {
    context.withPropertyValues("spring.profiles.active=prod").run {
      assertTrue(it.startupFailure != null)
    }
  }

  @Test
  fun `any other profile starts without an admin`() {
    context.run { assertTrue(it.startupFailure == null) }
  }
}
